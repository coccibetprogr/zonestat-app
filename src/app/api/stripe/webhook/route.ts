// src/app/api/stripe/webhook/route.ts
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import Stripe from "stripe";
import { log } from "@/utils/observability/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return new NextResponse("Webhook config missing", { status: 400 });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn("stripe.webhook.signature_error", { msg });
    return new NextResponse(`Webhook signature error: ${msg}`, { status: 400 });
  }

  // Helper : retrouver un userId à partir d'un customer Stripe
  async function findUserIdByCustomer(
    customerId: string | undefined,
  ): Promise<string | undefined> {
    if (!customerId) return undefined;

    // 1️⃣ D'abord : mapping direct via profiles.stripe_customer_id
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();

    if (error) {
      log.error("stripe.webhook.lookup_profile_error", {
        customerId,
        code: error.code,
        message: error.message,
      });
    }

    const row = data as { id: string } | null;
    if (row?.id) return row.id;

    // 2️⃣ Fallback simple : on tente un mapping par email
    //    (cas où tu as créé un abo à la main dans Stripe avec le bon email)
    try {
      const customer = await stripe.customers.retrieve(customerId);
      const email = (customer as any).email as string | null | undefined;

      if (!email) {
        log.warn("stripe.webhook.email_lookup_no_email", {
          customerId,
        });
        return undefined;
      }

      // On utilise l'admin Supabase pour trouver le user par email
      const { data: usersData, error: usersError } = await (supabaseAdmin as any).auth.admin.listUsers(
        { email },
      );

      if (usersError) {
        log.error("stripe.webhook.email_lookup_users_error", {
          customerId,
          email,
          message: usersError.message,
        });
        return undefined;
      }

      const users = (usersData as any)?.users as Array<{ id: string }> | undefined;
      if (!users || users.length !== 1) {
        log.warn("stripe.webhook.email_lookup_ambiguous", {
          customerId,
          email,
          userCount: users?.length ?? 0,
        });
        return undefined;
      }

      const userId = users[0].id;

      // On persiste le lien customer ↔ profil pour les prochains webhooks
      const { error: updateError } = await supabaseAdmin
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", userId);

      if (updateError) {
        log.error("stripe.webhook.email_link_profile_update_error", {
          userId,
          customerId,
          code: updateError.code,
          message: updateError.message,
        });
        return undefined;
      }

      log.info("stripe.webhook.email_link_success", {
        userId,
        customerId,
        email,
      });

      return userId;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error("stripe.webhook.email_lookup_error", {
        customerId,
        msg,
      });
      return undefined;
    }
  }

  try {
    switch (event.type) {
      // Paiement immédiat ou asynchrone terminé
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;

        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : undefined;
        const customerId =
          typeof session.customer === "string" ? session.customer : undefined;
        const userIdFromMeta = session.metadata?.supabase_user_id;

        if (!subscriptionId || !customerId) {
          log.warn("stripe.webhook.checkout_missing_ids", {
            eventType: event.type,
            subscriptionId,
            customerId,
          });
          break;
        }

        let userId: string | undefined = userIdFromMeta;
        if (!userId) {
          userId = await findUserIdByCustomer(customerId);
        }

        if (!userId) {
          log.warn("stripe.webhook.unmapped_checkout_session", {
            eventType: event.type,
            subscriptionId,
            customerId,
          });
          break;
        }

        const subscription = await stripe.subscriptions.retrieve(subscriptionId);

        const { error } = await supabaseAdmin
          .from("profiles")
          .update({
            stripe_customer_id: customerId,
            stripe_subscription_status: subscription.status,
            stripe_subscription_id: subscription.id,
          })
          .eq("id", userId as string);

        if (error) {
          log.error("stripe.webhook.profile_update_error", {
            eventType: event.type,
            userId,
            subscriptionId: subscription.id,
            customerId,
            code: error.code,
            message: error.message,
          });
          throw error;
        }

        break;
      }

      // Création / update / suppression d'une subscription
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId =
          typeof sub.customer === "string" ? sub.customer : undefined;

        let userId: string | undefined = sub.metadata?.supabase_user_id;
        if (!userId) {
          userId = await findUserIdByCustomer(customerId);
        }

        if (!userId) {
          log.warn("stripe.webhook.unmapped_subscription", {
            eventType: event.type,
            subscriptionId: sub.id,
            customerId,
          });
          break;
        }

        const { error } = await supabaseAdmin
          .from("profiles")
          .update({
            stripe_subscription_status: sub.status,
            stripe_subscription_id: sub.id,
          })
          .eq("id", userId as string);

        if (error) {
          log.error("stripe.webhook.profile_update_error", {
            eventType: event.type,
            userId,
            subscriptionId: sub.id,
            customerId,
            code: error.code,
            message: error.message,
          });
          throw error;
        }

        break;
      }

      // Factures réussies / échouées
      case "invoice.payment_succeeded":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;

        // Certaines définitions TS de Stripe ne déclarent pas .subscription, on passe par any
        const subscriptionId =
          typeof (invoice as any).subscription === "string"
            ? ((invoice as any).subscription as string)
            : undefined;
        const customerId =
          typeof invoice.customer === "string" ? invoice.customer : undefined;

        if (!subscriptionId || !customerId) {
          log.warn("stripe.webhook.invoice_missing_ids", {
            eventType: event.type,
            invoiceId: invoice.id,
            subscriptionId,
            customerId,
          });
          break;
        }

        const sub = await stripe.subscriptions.retrieve(subscriptionId);

        let userId: string | undefined = sub.metadata?.supabase_user_id;
        if (!userId) {
          userId = await findUserIdByCustomer(customerId);
        }

        if (!userId) {
          log.warn("stripe.webhook.unmapped_invoice", {
            eventType: event.type,
            invoiceId: invoice.id,
            subscriptionId: sub.id,
            customerId,
          });
          break;
        }

        const { error } = await supabaseAdmin
          .from("profiles")
          .update({
            stripe_subscription_status: sub.status,
            stripe_subscription_id: sub.id,
          })
          .eq("id", userId as string);

        if (error) {
          log.error("stripe.webhook.profile_update_error", {
            eventType: event.type,
            userId,
            subscriptionId: sub.id,
            customerId,
            code: error.code,
            message: error.message,
          });
          throw error;
        }

        break;
      }

      default: {
        // On log les évènements non gérés pour debug futur
        log.debug("stripe.webhook.unhandled_event", {
          eventType: event.type,
        });
        break;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("stripe.webhook.handler_error", {
      eventType: event.type,
      msg,
    });
    return new NextResponse("Webhook handler error", { status: 500 });
  }

  return new NextResponse("OK", { status: 200 });
}
