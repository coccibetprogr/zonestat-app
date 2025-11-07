import { serverClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import LogoutForm from "@/components/LogoutForm";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const supabase = await serverClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/account");

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id, stripe_subscription_status")
    .eq("id", user.id)
    .maybeSingle();

  const subscriptionStatus = profile?.stripe_subscription_status ?? "Aucun abonnement actif";

  return (
    <div className="max-w-3xl mx-auto w-full fade-in-up">
      <div className="card card-hover p-8 sm:p-10 space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Mon compte</h1>
          <p className="mt-2 text-fg-subtle text-sm">
            Consulte ou gère ton profil et ton abonnement.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="bg-bg-soft border border-line rounded-xl p-4 fade-in-scale">
            <h2 className="text-sm font-medium text-fg-subtle mb-1">Adresse email</h2>
            <p className="font-medium">{user.email}</p>
          </div>
          <div className="bg-bg-soft border border-line rounded-xl p-4 fade-in-scale">
            <h2 className="text-sm font-medium text-fg-subtle mb-1">ID utilisateur</h2>
            <p className="font-mono text-[13px] text-fg-muted break-all">{user.id}</p>
          </div>
        </div>

        <div className="border-t border-line pt-6 fade-in-up">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
            <h2 className="text-lg font-semibold">Abonnement</h2>
            {subscriptionStatus && subscriptionStatus !== "Aucun abonnement actif" ? (
              <span className="badge border-primary/40 bg-[rgba(16,185,129,0.08)] text-[var(--color-primary)]">
                {subscriptionStatus}
              </span>
            ) : (
              <span className="badge text-fg-muted">{subscriptionStatus}</span>
            )}
          </div>
          <p className="text-sm text-fg-subtle mb-5">
            Gère ton abonnement via le portail Stripe ou explore les formules disponibles.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link href="/pricing" className="btn btn-primary sm:w-auto w-full">
              Voir les formules
            </Link>
            <Link href="/billing-portal" className="btn btn-ghost sm:w-auto w-full">
              Gérer via Stripe
            </Link>
          </div>
        </div>

        <div className="text-center border-t border-line pt-6 fade-in-up">
          <LogoutForm buttonClassName="btn btn-ghost text-sm" />
        </div>
      </div>
    </div>
  );
}
