// src/app/billing-portal/route.ts
import { NextResponse } from "next/server";
import { actionClient } from "@/utils/supabase/action";
import { stripe } from "@/lib/stripe";
import { log } from "@/utils/observability/log";

export async function GET(req: Request) {
  const supabase = await actionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const url = new URL("/login?next=/billing-portal", req.url);
    return NextResponse.redirect(url, { status: 303 });
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    log.error("stripe.portal.profile_error", {
      userId: user.id,
      code: error.code,
      message: error.message,
    });
  }

  let stripeCustomerId = profile?.stripe_customer_id as string | null;

  // Fallback : essayer de retrouver le client Stripe par email
  if (!stripeCustomerId) {
    const customers = await stripe.customers.list({
      email: user.email || undefined,
      limit: 1,
    });

    const customer = customers.data[0];
    if (!customer) {
      // Pas d’abonnement / client → on renvoie vers pricing
      const url = new URL("/pricing", req.url);
      return NextResponse.redirect(url, { status: 303 });
    }

    stripeCustomerId = customer.id;

    // On persiste dans le profil
    await supabase
      .from("profiles")
      .update({ stripe_customer_id: stripeCustomerId })
      .eq("id", user.id);
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;

  const portal = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${siteUrl}/account`,
  });

  return NextResponse.redirect(portal.url, { status: 303 });
}
