// src/app/api/me/route.ts
import { NextResponse } from "next/server";
import { serverClientReadOnly } from "@/utils/supabase/server";
import { log } from "@/utils/observability/log";

export const dynamic = "force-dynamic";

type ProfileRow = {
  stripe_subscription_status: string | null;
  free_until: string | null;
};

type StripeStatusCategory = "active" | "warning" | "danger" | "muted" | "none";

function buildNoStoreHeaders() {
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate",
  };
}

function mapStripeStatus(
  status: string | null,
): { label: string; category: StripeStatusCategory } {
  switch (status) {
    case "active":
      return { label: "Actif", category: "active" };
    case "trialing":
      return { label: "Période d’essai Stripe", category: "active" };
    case "past_due":
      return { label: "En retard de paiement", category: "warning" };
    case "unpaid":
      return { label: "Impayé", category: "danger" };
    case "canceled":
      return { label: "Annulé", category: "danger" };
    case "incomplete":
      return { label: "Incomplet", category: "warning" };
    case "incomplete_expired":
      return { label: "Essai Stripe expiré", category: "muted" };
    default:
      return { label: "Aucun abonnement", category: "none" };
  }
}

export async function GET() {
  try {
    const supabase = await serverClientReadOnly();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    // Pas connecté → 401 + payload minimal (on ne change rien ici pour éviter de casser le front)
    if (userError || !user) {
      if (userError) {
        log.warn("api.me.get_user_error", {
          code: userError.code,
          message: userError.message,
        });
      }

      return NextResponse.json(
        {
          authenticated: false,
          canAccessPremium: false,
        },
        {
          status: 401,
          headers: buildNoStoreHeaders(),
        },
      );
    }

    // Récup profil (avec RLS : id = auth.uid())
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("stripe_subscription_status, free_until")
      .eq("id", user.id)
      .maybeSingle<ProfileRow>();

    if (profileError) {
      log.error("api.me.profile_error", {
        userId: user.id,
        code: profileError.code,
        message: profileError.message,
      });

      const stripeMeta = mapStripeStatus(null);

      // On renvoie quand même l’info "connecté mais pas d’abo"
      return NextResponse.json(
        {
          authenticated: true,
          user: {
            id: user.id,
            email: user.email,
          },
          access: {
            hasSubscription: false,
            isFreeTrial: false,
            canAccessPremium: false,
            // champs existants
            stripeStatus: null,
            freeUntil: null,
            // enrichi
            accessSource: "none" as const,
            trial: {
              isFreeTrial: false,
              freeUntil: null,
              daysLeft: null as number | null,
            },
            stripe: {
              status: null,
              label: stripeMeta.label,
              category: stripeMeta.category,
            },
          },
        },
        {
          status: 200,
          headers: buildNoStoreHeaders(),
        },
      );
    }

    const rawStatus = profile?.stripe_subscription_status ?? null;

    const hasSubscription =
      rawStatus !== null &&
      rawStatus !== "canceled" &&
      rawStatus !== "incomplete_expired";

    const now = new Date();
    const freeUntilRaw = profile?.free_until ?? null;
    const freeUntilDate =
      freeUntilRaw != null ? new Date(freeUntilRaw as string) : null;

    const isFreeTrial =
      freeUntilDate !== null &&
      !Number.isNaN(freeUntilDate.getTime()) &&
      freeUntilDate > now;

    const canAccessPremium = hasSubscription || isFreeTrial;

    // Source principale d’accès : abonnement, essai gratuit, ou rien
    const accessSource: "subscription" | "free_trial" | "none" =
      hasSubscription ? "subscription" : isFreeTrial ? "free_trial" : "none";

    // Jours restants d’essai
    let trialDaysLeft: number | null = null;
    if (isFreeTrial && freeUntilDate) {
      const diffMs = freeUntilDate.getTime() - now.getTime();
      trialDaysLeft = Math.max(
        0,
        Math.ceil(diffMs / (1000 * 60 * 60 * 24)),
      );
    }

    const stripeMeta = mapStripeStatus(rawStatus);

    return NextResponse.json(
      {
        authenticated: true,
        user: {
          id: user.id,
          email: user.email,
        },
        access: {
          // champs existants (pour ne rien casser)
          hasSubscription,
          isFreeTrial,
          canAccessPremium,
          stripeStatus: rawStatus,
          freeUntil: freeUntilDate ? freeUntilDate.toISOString() : null,
          // enrichi
          accessSource,
          trial: {
            isFreeTrial,
            freeUntil: freeUntilDate ? freeUntilDate.toISOString() : null,
            daysLeft: trialDaysLeft,
          },
          stripe: {
            status: rawStatus,
            label: stripeMeta.label,
            category: stripeMeta.category,
          },
        },
      },
      {
        status: 200,
        headers: buildNoStoreHeaders(),
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("api.me.unhandled_error", { msg });

    return NextResponse.json(
      {
        authenticated: false,
        canAccessPremium: false,
        error: "server_error",
      },
      {
        status: 500,
        headers: buildNoStoreHeaders(),
      },
    );
  }
}
