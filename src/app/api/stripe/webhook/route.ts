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

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.supabase_user_id;
        const customerId = session.customer as string | null;
        const subscriptionId = session.subscription as string | null;

        if (!userId || !customerId || !subscriptionId) break;

        const subscription = await stripe.subscriptions.retrieve(subscriptionId);

        await supabaseAdmin
          .from("profiles")
          .update({
            stripe_customer_id: customerId,
            stripe_subscription_status: subscription.status,
          })
          .eq("id", userId);

        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.supabase_user_id;
        if (!userId) break;

        await supabaseAdmin
          .from("profiles")
          .update({
            stripe_subscription_status: sub.status,
          })
          .eq("id", userId);

        break;
      }

      default:
        // on ignore les autres évènements
        break;
    }

    return new NextResponse("OK", { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("stripe.webhook.handler_error", { msg, type: event.type });
    return new NextResponse("Webhook handler error", { status: 500 });
  }
}
