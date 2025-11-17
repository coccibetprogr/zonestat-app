// src/app/account/page.tsx
import { serverClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import LogoutForm from "@/components/LogoutForm";
import { log } from "@/utils/observability/log";
import { stripe } from "@/lib/stripe";
import type Stripe from "stripe";

export const dynamic = "force-dynamic";

type UiStatusVariant = "success" | "warning" | "danger" | "muted";

function mapStripeStatusToUi(
  status: string | null | undefined,
): { label: string; variant: UiStatusVariant } {
  switch (status) {
    case "active":
      return { label: "Actif", variant: "success" };
    case "trialing":
      return { label: "Période d’essai", variant: "success" };
    case "past_due":
      return { label: "Paiement en retard", variant: "warning" };
    case "incomplete":
      return { label: "En attente de paiement", variant: "warning" };
    case "incomplete_expired":
      return { label: "Paiement expiré", variant: "danger" };
    case "unpaid":
      return { label: "Impayé", variant: "danger" };
    case "canceled":
      return { label: "Annulé", variant: "muted" };
    case "paused":
      return { label: "En pause", variant: "warning" };
    default:
      return { label: "Aucun abonnement actif", variant: "muted" };
  }
}

// petit type d'appoint pour calmer TypeScript sur current_period_end / cancel_at_period_end
type SubscriptionWithPeriod = Stripe.Subscription & {
  current_period_end?: number | null;
  cancel_at_period_end?: boolean | null;
};

function formatPeriodEnd(
  subscription: SubscriptionWithPeriod | null,
): string | null {
  const periodEnd = subscription?.current_period_end;
  if (!periodEnd) return null;

  const date = new Date(periodEnd * 1000);
  const formatted = date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  if (subscription?.cancel_at_period_end) {
    return `Se termine le ${formatted}.`;
  }

  return `Renouvellement le ${formatted}.`;
}

export default async function AccountPage() {
  const supabase = await serverClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    log.error("account.user_fetch_error", {
      code: userError.code,
      message: userError.message,
    });
  }

  if (!user) redirect("/login?next=/account");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("stripe_customer_id, stripe_subscription_status")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    log.error("account.profile_fetch_error", {
      userId: user.id,
      code: profileError.code,
      message: profileError.message,
    });
  }

  // On tente de récupérer l’abonnement Stripe en live si on a un customer_id
  let subscription: SubscriptionWithPeriod | null = null;
  if (profile?.stripe_customer_id) {
    try {
      const list = await stripe.subscriptions.list({
        customer: profile.stripe_customer_id,
        status: "all",
        limit: 1,
      });
      subscription = (list.data[0] as SubscriptionWithPeriod) ?? null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error("account.subscription_fetch_error", {
        userId: user.id,
        msg,
      });
    }
  }

  const rawStatus = profileError
    ? null
    : subscription?.status ?? profile?.stripe_subscription_status ?? null;

  const { label: statusLabel, variant } = mapStripeStatusToUi(rawStatus);
  const periodEndText = formatPeriodEnd(subscription);

  const hasAnySubscription =
    rawStatus && rawStatus !== "canceled" && rawStatus !== "incomplete_expired";

  const planNickname =
    subscription?.items?.data?.[0]?.price?.nickname ??
    subscription?.items?.data?.[0]?.price?.transform_quantity?.divide_by
      ? "Abonnement ZoneStat"
      : "Abonnement ZoneStat";

  let badgeClass =
    "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium text-fg-muted border border-line bg-bg-soft";

  if (variant === "success") {
    badgeClass =
      "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium border-primary/40 bg-[rgba(16,185,129,0.08)] text-[var(--color-primary)]";
  } else if (variant === "warning") {
    badgeClass =
      "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium border-amber-500/40 bg-[rgba(245,158,11,0.08)] text-amber-700";
  } else if (variant === "danger") {
    badgeClass =
      "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium border-red-500/40 bg-[rgba(248,113,113,0.08)] text-red-600";
  }

  return (
    <div className="max-w-4xl mx-auto w-full fade-in-up">
      <div className="card card-hover p-6 sm:p-8 lg:p-10 space-y-8">
        {/* Header */}
        <header className="flex flex-col gap-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Mon compte</h1>
          <p className="text-sm text-fg-subtle">
            Consulte tes informations personnelles et gère ton abonnement ZoneStat.
          </p>
        </header>

        {/* Infos utilisateur */}
        <section className="grid gap-4 sm:grid-cols-2">
          <div className="bg-bg-soft border border-line rounded-xl p-4 sm:p-5 flex flex-col gap-1 fade-in-scale">
            <span className="text-xs font-medium uppercase tracking-[0.08em] text-fg-subtle">
              Adresse email
            </span>
            <span className="font-medium text-sm sm:text-base break-all">
              {user.email}
            </span>
          </div>
          <div className="bg-bg-soft border border-line rounded-xl p-4 sm:p-5 flex flex-col gap-1 fade-in-scale">
            <span className="text-xs font-medium uppercase tracking-[0.08em] text-fg-subtle">
              ID utilisateur
            </span>
            <span className="font-mono text-[11px] sm:text-[13px] text-fg-muted break-all">
              {user.id}
            </span>
          </div>
        </section>

        {/* Abonnement */}
        <section className="border border-line rounded-2xl p-5 sm:p-6 lg:p-7 bg-gradient-to-br from-bg-soft to-bg">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">Abonnement ZoneStat</h2>
                {hasAnySubscription && (
                  <span className="text-[11px] rounded-full px-2 py-[2px] bg-bg-soft border border-line text-fg-subtle">
                    {planNickname}
                  </span>
                )}
              </div>
              {periodEndText && hasAnySubscription && (
                <p className="text-xs sm:text-sm">
                  <span className="text-fg-subtle">Prochaine échéance :</span>{" "}
                  <span className="font-medium">{periodEndText}</span>
                </p>
              )}
              {!hasAnySubscription && (
                <p className="text-xs sm:text-sm text-fg-subtle">
                  Tu n’as aucun abonnement actif pour le moment.
                </p>
              )}
            </div>

            <div className="flex items-center sm:items-end justify-between sm:flex-col gap-2">
              <span className={badgeClass}>{statusLabel}</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mt-2">
            {!hasAnySubscription && (
              <Link
                href="/pricing"
                className="btn btn-primary w-full sm:w-auto sm:min-w-[180px]"
              >
                Voir les formules
              </Link>
            )}
            <Link
              href="/billing-portal"
              className="btn btn-ghost w-full sm:w-auto sm:min-w-[200px]"
            >
              Gérer / annuler via Stripe
            </Link>
          </div>

          {hasAnySubscription && (
            <p className="mt-3 text-xs text-fg-subtle">
              Tu peux mettre ton abonnement en pause, changer de formule ou le
              résilier depuis le portail Stripe sécurisé.
            </p>
          )}
        </section>

        {/* Déconnexion */}
        <section className="pt-4 border-t border-line flex justify-center fade-in-up">
          <LogoutForm buttonClassName="btn btn-ghost text-sm" />
        </section>
      </div>
    </div>
  );
}
