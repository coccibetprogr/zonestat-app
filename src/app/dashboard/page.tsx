// src/app/dashboard/page.tsx
import { serverClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type ProfileRow = {
  stripe_subscription_status: string | null;
  free_until: string | null;
};

export default async function DashboardPage() {
  const supabase = await serverClient();

  // 1) Récup user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    // En cas d’erreur Supabase, on force la reconnexion
    redirect("/login?next=/dashboard");
  }

  if (!user) {
    redirect("/login?next=/dashboard");
  }

  // 2) Récup profil pour connaître le statut Stripe + essai gratuit
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("stripe_subscription_status, free_until")
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();

  if (profileError) {
    // Si on n’arrive pas à lire le profil, on renvoie vers la page pricing
    // (mieux vaut refuser l’accès que laisser passer n’importe qui)
    redirect("/pricing");
  }

  const rawStatus = profile?.stripe_subscription_status ?? null;

  // Même logique que sur /account : on considère qu’il y a un abonnement
  // tant que le statut n’est pas "canceled" ni "incomplete_expired".
  let hasAnySubscription =
    rawStatus !== null &&
    rawStatus !== "canceled" &&
    rawStatus !== "incomplete_expired";

  // --- Essai gratuit via free_until ---
  const now = new Date();
  const freeUntilRaw = profile?.free_until ?? null;
  const freeUntilDate =
    freeUntilRaw != null ? new Date(freeUntilRaw as string) : null;

  const isFreeTrial =
    freeUntilDate !== null &&
    !Number.isNaN(freeUntilDate.getTime()) &&
    freeUntilDate > now;

  if (!hasAnySubscription && !isFreeTrial) {
    // Pas d’abonnement actif et pas d’essai gratuit → on envoie vers la page des formules
    redirect("/pricing");
  }

  // 3) Accès autorisé → contenu privé du dashboard
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <p className="text-white/70">
        Bienvenue sur ton espace ZoneStat. Ton accès est actif
        {isFreeTrial ? " (essai gratuit en cours)." : " (abonnement en cours)."}
      </p>

      {/* Ici tu pourras brancher tes vraies stats / widgets */}
      <div className="mt-4 border border-line rounded-xl p-4 bg-bg-soft">
        <p className="text-sm text-fg-subtle">
          Ici on mettra tes stats/jour, tes analyses et tout le contenu premium.
        </p>
      </div>
    </div>
  );
}
