// src/app/pricing/page.tsx
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { serverClient } from "@/utils/supabase/server";
import { actionClient } from "@/utils/supabase/action";
import { log } from "@/utils/observability/log";
import { stripe } from "@/lib/stripe";
import {
  PRICING_PLANS,
  getPriceIdFromEnv,
} from "@/config/pricing";
import {
  getAllowedOriginsFromHeaders,
  isOriginAllowed,
} from "@/utils/security/origin";
import type Stripe from "stripe";

export const dynamic = "force-dynamic";

/**
 * Server action Stripe Checkout (définie dans le même fichier pour éviter l'import ./actions)
 */
export async function createCheckoutSession(
  formData: FormData,
): Promise<void> {
  "use server";

  const h = await headers();

  // ---- Vérif Origin (aligné avec le reste de ton app) ----
  const allowed = getAllowedOriginsFromHeaders(h);
  const origin = h.get("origin") || h.get("referer");
  if (!isOriginAllowed(origin, allowed)) {
    log.warn("stripe.checkout.invalid_origin", { origin });
    throw new Error("Requête invalide (origin).");
  }

  const priceId = formData.get("priceId")?.toString() || "";
  if (!priceId) {
    throw new Error("Missing priceId");
  }

  // Vérifie que le priceId correspond bien à un plan déclaré côté config
  const plan = PRICING_PLANS.find(
    (p) => getPriceIdFromEnv(p) === priceId,
  );
  if (!plan) {
    log.warn("stripe.checkout.unknown_price", { priceId });
    throw new Error("Prix invalide.");
  }

  const supabase = await actionClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    log.error("stripe.checkout.user_error", {
      code: userError.code,
      message: userError.message,
    });
  }

  if (!user) {
    redirect("/login?next=/pricing");
  }

  // Détermine l’URL du site
  const originHeader = origin || "";
  let siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  try {
    if (!process.env.NEXT_PUBLIC_SITE_URL && originHeader) {
      siteUrl = new URL(originHeader).origin;
    }
  } catch {
    // on garde le fallback
  }

  // On récupère éventuellement le stripe_customer_id pour réutiliser le client Stripe
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user!.id)
    .maybeSingle();

  if (profileError) {
    log.error("stripe.checkout.profile_error", {
      userId: user!.id,
      code: profileError.code,
      message: profileError.message,
    });
  }

  // Création de la session de Checkout (avec réutilisation éventuelle du customer)
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${siteUrl}/account?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/pricing?checkout=cancel`,
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    client_reference_id: user!.id,
    subscription_data: {
      metadata: {
        supabase_user_id: user!.id,
        plan_key: plan.key,
      },
    },
    metadata: {
      supabase_user_id: user!.id,
      plan_key: plan.key,
    },
  };

  // 🔁 Réutilise un customer Stripe existant si on l’a, sinon fallback email
  if (profile?.stripe_customer_id) {
    params.customer = profile.stripe_customer_id as string;
  } else if (user!.email) {
    params.customer_email = user!.email;
  }

  const session = await stripe.checkout.sessions.create(params);

  if (!session.url) {
    log.error("stripe.checkout.no_session_url", {
      userId: user!.id,
    });
    throw new Error("Impossible de créer la session de paiement.");
  }

  // Redirection vers Stripe Checkout
  redirect(session.url);
}

export default async function PricingPage() {
  const supabase = await serverClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    // en cas de souci, on renvoie vers login
    redirect("/login?next=/pricing");
  }

  if (!user) {
    redirect("/login?next=/pricing");
  }

  const readyPlans = PRICING_PLANS.map((plan) => ({
    ...plan,
    priceId: getPriceIdFromEnv(plan),
  })).filter((p) => p.priceId);

  return (
    <div className="max-w-3xl mx-auto w-full fade-in-up">
      <div className="card card-hover p-8 sm:p-10 space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight">
            Choisir une formule
          </h1>
          <p className="mt-2 text-fg-subtle text-sm">
            Active ton abonnement ZoneStat pour débloquer toutes les
            fonctionnalités.
          </p>
        </div>

        {readyPlans.length === 0 ? (
          <div className="text-sm text-fg-subtle text-center">
            Aucun plan n’est encore configuré côté serveur (
            <code>STRIPE_PRICE_*</code> manquants dans les
            variables d’environnement).
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2">
            {readyPlans.map((plan) => (
              <form
                key={plan.key}
                action={createCheckoutSession}
                className={`bg-bg-soft border border-line rounded-xl p-5 flex flex-col gap-3 fade-in-scale ${
                  plan.highlight
                    ? "ring-1 ring-[var(--color-primary)]"
                    : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold">
                    {plan.name}
                  </h2>
                  {plan.highlight && (
                    <span className="badge text-xs border-primary/40 bg-[rgba(16,185,129,0.08)] text-[var(--color-primary)]">
                      Populaire
                    </span>
                  )}
                </div>

                <p className="text-sm text-fg-subtle">
                  {plan.description}
                </p>

                <p className="text-xl font-semibold mt-2">
                  {plan.priceLabel}
                </p>

                <input
                  type="hidden"
                  name="priceId"
                  value={plan.priceId as string}
                />

                <button
                  type="submit"
                  className="btn btn-primary mt-3 w-full"
                >
                  Continuer vers le paiement
                </button>
              </form>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
