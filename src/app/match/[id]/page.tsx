// src/app/match/[id]/page.tsx

import { redirect } from "next/navigation";
import { serverClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

type ProfileRow = {
  stripe_subscription_status: string | null;
  free_until: string | null;
};

function canAccessPremiumFromProfile(profile: ProfileRow | null): boolean {
  if (!profile) return false;

  const rawStatus = profile.stripe_subscription_status ?? null;

  const hasSubscription =
    rawStatus !== null &&
    rawStatus !== "canceled" &&
    rawStatus !== "incomplete_expired";

  const now = new Date();
  const freeUntilRaw = profile.free_until ?? null;
  const freeUntilDate =
    freeUntilRaw != null ? new Date(freeUntilRaw as string) : null;

  const isFreeTrial =
    freeUntilDate !== null &&
    !Number.isNaN(freeUntilDate.getTime()) &&
    freeUntilDate > now;

  return hasSubscription || isFreeTrial;
}

export default async function MatchPage(props: {
  params: Promise<{ id: string }>;
}) {
  // ✅ Next 16 : params est un Promise → on l'attend
  const { id } = await props.params;

  const supabase = await serverClient();

  // 1️⃣ Vérifier que l'utilisateur est connecté
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    console.warn("[match] supabase.auth.getUser error", userError);
  }

  if (!user) {
    return redirect(`/login?next=/match/${id}`);
  }

  // 2️⃣ Vérifier l'accès premium directement via la table profiles
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("stripe_subscription_status, free_until")
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();

  if (profileError) {
    console.warn("[match] profile fetch error", profileError);
  }

  const canAccessPremium = canAccessPremiumFromProfile(profile ?? null);

  if (!canAccessPremium) {
    return redirect("/pricing");
  }

  // 3️⃣ Récupérer le dashboard le plus récent
  const { data: dashboard, error: dashboardError } = await supabase
    .from("daily_dashboards")
    .select("data")
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (dashboardError) {
    console.error("[match] daily_dashboards error", dashboardError);
  }

  if (!dashboard?.data || !Array.isArray(dashboard.data.matches)) {
    return (
      <div className="p-6">
        <div className="card p-6 space-y-2">
          <h1 className="text-lg font-semibold text-fg">Match introuvable</h1>
          <p className="text-sm text-fg-muted">
            Aucun dashboard n&apos;a été généré ou les données sont manquantes.
          </p>
        </div>
      </div>
    );
  }

  // 4️⃣ Récupérer le match par ID
  const match = dashboard.data.matches.find((m: any) => String(m.id) === id);

  if (!match) {
    return (
      <div className="p-6">
        <div className="card p-6 space-y-2">
          <h1 className="text-lg font-semibold text-fg">Match introuvable</h1>
          <p className="text-sm text-fg-muted">
            Ce match n&apos;existe pas dans le dashboard chargé.
          </p>
        </div>
      </div>
    );
  }

  // 5️⃣ UI de la fiche match
  return (
    <div className="fade-in-up space-y-8 px-4 py-6 max-w-3xl mx-auto">
      {/* Header */}
      <section className="card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {match.homeLogo && (
              <img
                src={match.homeLogo}
                className="w-12 h-12 rounded-md"
                alt={match.homeTeam}
              />
            )}
            <span className="text-xl font-semibold">{match.homeTeam}</span>
          </div>

          <span className="text-lg font-medium">VS</span>

          <div className="flex items-center gap-3">
            <span className="text-xl font-semibold">{match.awayTeam}</span>
            {match.awayLogo && (
              <img
                src={match.awayLogo}
                className="w-12 h-12 rounded-md"
                alt={match.awayTeam}
              />
            )}
          </div>
        </div>

        <p className="text-fg-muted text-sm mt-4">
          {match.league} •{" "}
          {new Date(match.kickoff).toLocaleString("fr-FR")}
        </p>

        {match.note && (
          <p className="mt-3 text-sm italic text-fg-muted">
            {match.note}
          </p>
        )}
      </section>

      {/* Stats */}
      <section className="card p-6 space-y-4">
        <h2 className="text-xl font-semibold">Statistiques clés</h2>

        {!match.stats ? (
          <p className="text-fg-muted text-sm">
            Aucune statistique détaillée n&apos;est disponible pour ce match (xG, tirs, etc.).
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p>xG domicile : {match.stats.xg_home}</p>
              <p>Tirs : {match.stats.shots_home}</p>
              <p>Tirs cadrés : {match.stats.shots_on_target_home}</p>
            </div>
            <div>
              <p>xG extérieur : {match.stats.xg_away}</p>
              <p>Tirs : {match.stats.shots_away}</p>
              <p>Tirs cadrés : {match.stats.shots_on_target_away}</p>
            </div>
          </div>
        )}
      </section>

      {/* Forme */}
      <section className="card p-6 space-y-4">
        <h2 className="text-xl font-semibold">Forme récente</h2>

        {!match.form ? (
          <p className="text-fg-muted text-sm">
            Données de forme récentes indisponibles pour ce match.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-semibold">{match.homeTeam}</p>
              <p>5 derniers matchs : {match.form.home_last5?.join(" ")}</p>
              <p>Buts marqués : {match.form.home_goals_scored}</p>
              <p>Buts encaissés : {match.form.home_goals_conceded}</p>
            </div>

            <div>
              <p className="font-semibold">{match.awayTeam}</p>
              <p>5 derniers matchs : {match.form.away_last5?.join(" ")}</p>
              <p>Buts marqués : {match.form.away_goals_scored}</p>
              <p>Buts encaissés : {match.form.away_goals_conceded}</p>
            </div>
          </div>
        )}
      </section>

      {/* IA */}
      <section className="card p-6 space-y-4">
        <h2 className="text-xl font-semibold">Prédictions IA</h2>

        {!match.predictions ? (
          <p className="text-fg-muted text-sm">
            Les prédictions IA ne sont pas encore disponibles pour ce match.
          </p>
        ) : (
          <div className="space-y-1 text-sm">
            <p>Victoire domicile : {match.predictions.homeWinProb}%</p>
            <p>Nul : {match.predictions.drawProb}%</p>
            <p>Victoire extérieur : {match.predictions.awayWinProb}%</p>
            <p>Score probable : {match.predictions.scoreProbable}</p>
            <p>Confiance IA : {match.predictions.confiance}</p>
          </div>
        )}
      </section>
    </div>
  );
}
