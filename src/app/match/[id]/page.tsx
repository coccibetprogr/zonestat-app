// src/app/match/[id]/page.tsx

import Link from "next/link";
import { redirect } from "next/navigation";
import { serverClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

type ProfileRow = {
  stripe_subscription_status: string | null;
  free_until: string | null;
};

type DashboardRow = {
  date: string;
  data: {
    matches?: any[];
  } | null;
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

function riskBadgeClasses(risk: string | undefined) {
  if (risk === "high") {
    return "bg-rose-50 text-rose-700 border border-rose-100";
  }
  if (risk === "medium") {
    return "bg-amber-50 text-amber-700 border border-amber-100";
  }
  return "bg-emerald-50 text-emerald-700 border border-emerald-100";
}

function riskLabel(risk: string | undefined) {
  if (risk === "high") return "Match à risque";
  if (risk === "medium") return "Risque modéré";
  return "Profil plutôt stable";
}

/**
 * Petite barre horizontale pour représenter un pourcentage (0–100).
 */
function PercentageBar({
  value,
  thickness = "h-1.5",
}: {
  value: number;
  thickness?: string;
}) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      className={`mt-1 rounded-full bg-slate-100 overflow-hidden ${thickness}`}
    >
      <div
        className="h-full rounded-full bg-[var(--color-primary)]/85 transition-[width]"
        style={{ width: `${v}%` }}
      />
    </div>
  );
}

/**
 * Forme type ["W","D","L","W"] avec couleurs
 */
function renderFormArray(seq?: string[]) {
  if (!seq || seq.length === 0) {
    return <span className="text-slate-400">—</span>;
  }

  return (
    <span className="inline-flex gap-1">
      {seq.map((ch, idx) => {
        const c = ch.toUpperCase();
        let cls =
          "px-1.5 py-0.5 rounded-full text-[11px] border font-semibold leading-none";

        if (c === "W") {
          cls += " bg-emerald-50 text-emerald-700 border-emerald-100";
        } else if (c === "L") {
          cls += " bg-rose-50 text-rose-700 border-rose-100";
        } else if (c === "D") {
          cls += " bg-amber-50 text-amber-700 border-amber-100";
        } else {
          cls += " bg-slate-100 text-slate-500 border-slate-200";
        }

        return (
          <span key={idx} className={cls}>
            {c}
          </span>
        );
      })}
    </span>
  );
}

/**
 * Forme type "WDWLW" avec couleurs
 */
function renderFormString(form?: string | null) {
  if (!form) return <span className="text-slate-400">—</span>;

  const chars = form.split("");

  return (
    <span className="inline-flex gap-1">
      {chars.map((ch, idx) => {
        const c = ch.toUpperCase();
        let cls =
          "px-1.5 py-0.5 rounded-full text-[11px] border font-semibold leading-none";

        if (c === "W") {
          cls += " bg-emerald-50 text-emerald-700 border-emerald-100";
        } else if (c === "L") {
          cls += " bg-rose-50 text-rose-700 border-rose-100";
        } else if (c === "D") {
          cls += " bg-amber-50 text-amber-700 border-amber-100";
        } else {
          cls += " bg-slate-100 text-slate-500 border-slate-200";
        }

        return (
          <span key={idx} className={cls}>
            {c}
          </span>
        );
      })}
    </span>
  );
}

export default async function MatchPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  console.log("[match] start", { matchId: id });

  const supabase = await serverClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    console.warn("[match] supabase.auth.getUser error", userError);
  }

  if (!user) {
    console.log("[match] no user, redirect to login", { matchId: id });
    return redirect(`/login?next=/match/${id}`);
  }

  console.log("[match] user loaded", { userId: user.id, matchId: id });

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("stripe_subscription_status, free_until")
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();

  if (profileError) {
    console.warn("[match] profile fetch error", profileError);
  }

  const canAccessPremium = canAccessPremiumFromProfile(profile ?? null);
  console.log("[match] premium check", {
    matchId: id,
    userId: user.id,
    canAccessPremium,
  });

  if (!canAccessPremium) {
    console.log("[match] no premium access, redirect /pricing", {
      matchId: id,
      userId: user.id,
    });
    return redirect("/pricing");
  }

  // ------------------------------------------------------------
  // Récupération des dashboards sur une fenêtre de dates
  // (aujourd'hui - 2 jours jusqu'à aujourd'hui + 13 jours)
  // ------------------------------------------------------------
  const today = new Date();
  const startDateObj = new Date(today);
  startDateObj.setDate(startDateObj.getDate() - 2);

  // On scanne jusqu'à J+13 pour couvrir les 14 jours générés par le cron
  const endDateObj = new Date(today);
  endDateObj.setDate(endDateObj.getDate() + 13);

  const startDate = startDateObj.toISOString().slice(0, 10);
  const endDate = endDateObj.toISOString().slice(0, 10);

  console.log("[match] loading dashboards in range", {
    matchId: id,
    startDate,
    endDate,
  });

  const { data, error: dashboardsError } = await supabase
    .from("daily_dashboards")
    .select("date,data")
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date", { ascending: false });

  if (dashboardsError) {
    console.error("[match] daily_dashboards error", dashboardsError);
  }

  const dashboards = (data as DashboardRow[] | null) ?? [];

  console.log("[match] dashboards fetched", {
    matchId: id,
    dashboardsCount: dashboards.length,
  });

  if (!dashboards.length) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-3xl mx-auto px-4 py-10">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-2 shadow-sm">
            <h1 className="text-lg font-semibold text-slate-900">
              Match introuvable
            </h1>
            <p className="text-sm text-slate-500">
              Aucun dashboard n&apos;a été généré sur la période récente.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------
  // Recherche du match dans tous les dashboards chargés
  // ------------------------------------------------------------
  let match: any | null = null;
  let matchDashboardDate: string | null = null;

  for (const row of dashboards) {
    const matches = row.data?.matches ?? [];
    if (!Array.isArray(matches)) continue;

    const found = matches.find((m: any) => String(m.id) === String(id));

    if (found) {
      match = found;
      matchDashboardDate = row.date;
      break;
    }
  }

  console.log("[match] search result", {
    matchId: id,
    found: Boolean(match),
    matchDashboardDate,
  });

  if (!match) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-3xl mx-auto px-4 py-10">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-2 shadow-sm">
            <h1 className="text-lg font-semibold text-slate-900">
              Match introuvable
            </h1>
            <p className="text-sm text-slate-500">
              Ce match n&apos;existe pas dans les dashboards chargés (J-2 à
              J+13).
            </p>
          </div>
        </div>
      </div>
    );
  }

  console.log("[match] match found", {
    matchId: id,
    league: match.league,
    kickoff: match.kickoff ?? null,
  });

  const homeSeason = match.homeSeason as
    | {
        goals_for_avg: number;
        goals_against_avg: number;
        matches_played: number;
        clean_sheet_percent: number;
        failed_to_score_percent: number;
        wins: number;
        draws: number;
        losses: number;
      }
    | undefined;

  const awaySeason = match.awaySeason as typeof homeSeason;

  const homeStanding = match.homeStanding as
    | { rank: number; points: number; goals_diff: number; form?: string | null }
    | undefined;

  const awayStanding = match.awayStanding as typeof homeStanding;

  // Kickoff robuste (kickoff peut manquer ou être invalide)
  const kickoffRaw: string | null =
    typeof match.kickoff === "string" ? match.kickoff : null;
  const kickoff = kickoffRaw && !Number.isNaN(new Date(kickoffRaw).getTime())
    ? new Date(kickoffRaw)
    : null;

  const venue: string | undefined =
    match.venue ?? match.stadium ?? match.ground ?? undefined;

  // ————————————————————————————————
  // UI
  // ————————————————————————————————

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 shadow-sm hover:bg-slate-50 transition"
          >
            <span className="text-[13px]">←</span>
            <span>Retour au dashboard</span>
          </Link>

          <span className="inline-flex items-center gap-1 rounded-full bg-slate-900 text-slate-50 px-3 py-1 text-[11px] uppercase tracking-[0.16em] shadow-sm">
            ● ZoneStat Pro
          </span>
        </div>

        {/* HERO compact, clean */}
        <section className="rounded-3xl border border-slate-200 bg-white px-5 py-5 sm:px-7 sm:py-6 shadow-sm space-y-5">
          {/* Ligne titre */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400 mb-1">
                Fiche match
              </p>
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">
                {match.homeTeam}{" "}
                <span className="text-slate-400 text-xl">vs</span>{" "}
                {match.awayTeam}
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                {match.league}
                {kickoff ? (
                  <>
                    {" "}
                    •{" "}
                    {kickoff.toLocaleString("fr-FR", {
                      weekday: "short",
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </>
                ) : (
                  " • Horaire à confirmer"
                )}
                {venue ? ` • ${venue}` : ""}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 justify-start md:justify-end">
              <span
                className={
                  "inline-flex items-center rounded-full px-3 py-1 text-[11px] font-medium " +
                  riskBadgeClasses(match.riskLevel)
                }
              >
                {riskLabel(match.riskLevel)}
              </span>

              {Array.isArray(match.tags) &&
                match.tags.slice(0, 2).map((tag: string) => (
                  <span
                    key={tag}
                    className="inline-flex items-center rounded-full bg-slate-50 border border-slate-200 px-3 py-1 text-[11px] text-slate-600"
                  >
                    {tag}
                  </span>
                ))}
            </div>
          </div>

          {/* Ligne équipes + infos principales */}
          <div className="flex flex-col lg:flex-row lg:items-stretch gap-6">
            {/* Duel équipes */}
            <div className="flex-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                {match.homeLogo && (
                  <div className="flex items-center justify-center rounded-2xl bg-slate-50 border border-slate-200 h-14 w-14 sm:h-16 sm:w-16">
                    <img
                      src={match.homeLogo}
                      className="h-10 w-10 object-contain"
                      alt={match.homeTeam}
                    />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                    Domicile
                  </p>
                  <p className="text-lg sm:text-xl font-semibold truncate">
                    {match.homeTeam}
                  </p>
                </div>
              </div>

              <div className="flex flex-col items-center justify-center px-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
                  Coup d&apos;envoi
                </p>
                <p className="text-base font-semibold text-slate-900">
                  {kickoff
                    ? kickoff.toLocaleTimeString("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—"}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {kickoff
                    ? kickoff.toLocaleDateString("fr-FR", {
                        weekday: "short",
                        day: "2-digit",
                        month: "short",
                      })
                    : ""}
                </p>
              </div>

              <div className="flex items-center gap-3 min-w-0 justify-end">
                <div className="text-right min-w-0">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                    Extérieur
                  </p>
                  <p className="text-lg sm:text-xl font-semibold truncate">
                    {match.awayTeam}
                  </p>
                </div>
                {match.awayLogo && (
                  <div className="flex items-center justify-center rounded-2xl bg-slate-50 border border-slate-200 h-14 w-14 sm:h-16 sm:w-16">
                    <img
                      src={match.awayLogo}
                      className="h-10 w-10 object-contain"
                      alt={match.awayTeam}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Profil du match (over / BTTS) */}
            <div className="lg:w-[260px] rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3.5 space-y-2.5 text-xs">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                Profil du match
              </p>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Over 1,5 buts</span>
                    <span className="font-medium">
                      {match.over15Prob}
                      {" %"}
                    </span>
                  </div>
                  <PercentageBar value={match.over15Prob ?? 0} />
                </div>
                <div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Over 2,5 buts</span>
                    <span className="font-medium">
                      {match.over25Prob}
                      {" %"}
                    </span>
                  </div>
                  <PercentageBar value={match.over25Prob ?? 0} />
                </div>
                <div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">BTTS</span>
                    <span className="font-medium">
                      {match.bttsProb}
                      {" %"}
                    </span>
                  </div>
                  <PercentageBar value={match.bttsProb ?? 0} />
                </div>
              </div>
            </div>
          </div>

          {/* Note / synthèse */}
          {match.note && (
            <div className="border-t border-slate-200 pt-3">
              <p className="text-[13px] text-slate-600 leading-relaxed">
                {match.note}
              </p>
            </div>
          )}
        </section>

        {/* CONTENU : sections empilées */}
        <div className="space-y-5">
          {/* Synthèse ZoneStat */}
          <section className="rounded-3xl border border-slate-200 bg-white px-5 py-4 space-y-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">
                Synthèse ZoneStat
              </h2>
              <span className="text-[11px] text-slate-500">
                Vue globale du rapport de forces
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="rounded-2xl bg-slate-50 border border-slate-200 px-3 py-2.5 space-y-1.5">
                <p className="text-[11px] text-slate-500">Tendance buts</p>
                <p className="text-sm font-semibold text-slate-900">
                  {match.over25Prob >= 60
                    ? "Match potentiellement ouvert"
                    : match.over25Prob <= 45
                    ? "Match plutôt fermé"
                    : "Profil intermédiaire"}
                </p>
                <p className="text-[11px] text-slate-500">
                  Over 2,5 : {match.over25Prob}% • BTTS : {match.bttsProb}%
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 border border-slate-200 px-3 py-2.5 space-y-1.5">
                <p className="text-[11px] text-slate-500">Risque global</p>
                <p className="text-sm font-semibold text-slate-900">
                  {riskLabel(match.riskLevel)}
                </p>
                <p className="text-[11px] text-slate-500">
                  À croiser avec compos, contexte, calendrier.
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 border border-slate-200 px-3 py-2.5 space-y-1.5">
                <p className="text-[11px] text-slate-500">Lecture conseillée</p>
                <p className="text-sm font-semibold text-slate-900">
                  Outil d&apos;appui, pas verdict.
                </p>
                <p className="text-[11px] text-slate-500">
                  Combine avec ton ressenti et ta stratégie.
                </p>
              </div>
            </div>
          </section>

          {/* Forme récente + classement */}
          <section className="rounded-3xl border border-slate-200 bg-white px-5 py-4 space-y-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">
                Dynamiques & forme récente
              </h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-sm">
              {/* Home */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                      Domicile
                    </p>
                    <p className="font-semibold text-slate-900">
                      {match.homeTeam}
                    </p>
                  </div>
                  {homeStanding && (
                    <div className="rounded-full bg-slate-50 border border-slate-200 px-3 py-1 text-[11px] text-slate-700">
                      Rang {homeStanding.rank} · {homeStanding.points} pts
                    </div>
                  )}
                </div>

                {match.form ? (
                  <div className="space-y-2">
                    <p className="text-[11px] text-slate-500">
                      5 derniers matchs
                    </p>
                    <div>{renderFormArray(match.form.home_last5)}</div>
                    <p className="text-[11px] text-slate-500">
                      Buts marqués : {match.form.home_goals_scored} • Buts
                      encaissés : {match.form.home_goals_conceded}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    Données de forme récentes indisponibles.
                  </p>
                )}

                {homeStanding?.form && (
                  <div className="space-y-1">
                    <p className="text-[11px] text-slate-500">
                      Série en championnat
                    </p>
                    <div>{renderFormString(homeStanding.form)}</div>
                  </div>
                )}
              </div>

              {/* Away */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-right">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                      Extérieur
                    </p>
                    <p className="font-semibold text-slate-900">
                      {match.awayTeam}
                    </p>
                  </div>
                  {awayStanding && (
                    <div className="rounded-full bg-slate-50 border border-slate-200 px-3 py-1 text-[11px] text-slate-700">
                      Rang {awayStanding.rank} · {awayStanding.points} pts
                    </div>
                  )}
                </div>

                {match.form ? (
                  <div className="space-y-2">
                    <p className="text-[11px] text-slate-500">
                      5 derniers matchs
                    </p>
                    <div>{renderFormArray(match.form.away_last5)}</div>
                    <p className="text-[11px] text-slate-500">
                      Buts marqués : {match.form.away_goals_scored} • Buts
                      encaissés : {match.form.away_goals_conceded}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    Données de forme récentes indisponibles.
                  </p>
                )}

                {awayStanding?.form && (
                  <div className="space-y-1">
                    <p className="text-[11px] text-slate-500">
                      Série en championnat
                    </p>
                    <div>{renderFormString(awayStanding.form)}</div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Profil saison */}
          <section className="rounded-3xl border border-slate-200 bg-white px-5 py-4 space-y-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">
                Profil saison
              </h2>
              <span className="text-[11px] text-slate-500">
                Moyennes buts & solidité
              </span>
            </div>

            {!homeSeason && !awaySeason ? (
              <p className="text-sm text-slate-500">
                Les statistiques de saison ne sont pas encore disponibles pour
                cette affiche.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="space-y-2 rounded-2xl bg-slate-50 border border-slate-200 px-3 py-3">
                  <p className="font-semibold text-slate-900 mb-1">
                    {match.homeTeam}
                  </p>
                  {homeSeason ? (
                    <>
                      <div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">
                            Buts marqués / match
                          </span>
                          <span className="font-medium text-slate-900">
                            {homeSeason.goals_for_avg.toFixed(2)}
                          </span>
                        </div>
                        <PercentageBar
                          value={Math.min(
                            100,
                            Math.round((homeSeason.goals_for_avg / 3) * 100),
                          )}
                          thickness="h-1"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">
                            Buts encaissés / match
                          </span>
                          <span className="font-medium text-slate-900">
                            {homeSeason.goals_against_avg.toFixed(2)}
                          </span>
                        </div>
                        <PercentageBar
                          value={Math.min(
                            100,
                            Math.round(
                              (homeSeason.goals_against_avg / 3) * 100,
                            ),
                          )}
                          thickness="h-1"
                        />
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Matchs joués</span>
                        <span className="font-medium text-slate-900">
                          {homeSeason.matches_played}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Clean sheets</span>
                        <span className="font-medium text-slate-900">
                          {homeSeason.clean_sheet_percent}%
                        </span>
                      </div>
                    </>
                  ) : (
                    <p className="text-slate-500">
                      Stats saison indisponibles.
                    </p>
                  )}
                </div>

                <div className="space-y-2 rounded-2xl bg-slate-50 border border-slate-200 px-3 py-3">
                  <p className="font-semibold text-slate-900 mb-1">
                    {match.awayTeam}
                  </p>
                  {awaySeason ? (
                    <>
                      <div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">
                            Buts marqués / match
                          </span>
                          <span className="font-medium text-slate-900">
                            {awaySeason.goals_for_avg.toFixed(2)}
                          </span>
                        </div>
                        <PercentageBar
                          value={Math.min(
                            100,
                            Math.round((awaySeason.goals_for_avg / 3) * 100),
                          )}
                          thickness="h-1"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">
                            Buts encaissés / match
                          </span>
                          <span className="font-medium text-slate-900">
                            {awaySeason.goals_against_avg.toFixed(2)}
                          </span>
                        </div>
                        <PercentageBar
                          value={Math.min(
                            100,
                            Math.round(
                              (awaySeason.goals_against_avg / 3) * 100,
                            ),
                          )}
                          thickness="h-1"
                        />
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Matchs joués</span>
                        <span className="font-medium text-slate-900">
                          {awaySeason.matches_played}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Clean sheets</span>
                        <span className="font-medium text-slate-900">
                          {awaySeason.clean_sheet_percent}%
                        </span>
                      </div>
                    </>
                  ) : (
                    <p className="text-slate-500">
                      Stats saison indisponibles.
                    </p>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* H2H */}
          <section className="rounded-3xl border border-slate-200 bg-white px-5 py-4 space-y-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">
                Confrontations directes
              </h2>
              <span className="text-[11px] text-slate-500">
                Historique récent entre les deux équipes
              </span>
            </div>

            {!match.h2h || !match.h2h.results?.length ? (
              <p className="text-sm text-slate-500">
                Aucune confrontation récente disponible entre ces deux équipes.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-4 text-sm">
                  <div className="w-32">
                    <p className="text-[11px] text-slate-500">BTTS</p>
                    <p className="text-base font-semibold text-slate-900">
                      {match.h2h.tendances?.btts ?? 50}%
                    </p>
                    <PercentageBar
                      value={match.h2h.tendances?.btts ?? 50}
                      thickness="h-1.5"
                    />
                  </div>
                  <div className="w-32">
                    <p className="text-[11px] text-slate-500">Over 2,5</p>
                    <p className="text-base font-semibold text-slate-900">
                      {match.h2h.tendances?.over25 ?? 50}%
                    </p>
                    <PercentageBar
                      value={match.h2h.tendances?.over25 ?? 50}
                      thickness="h-1.5"
                    />
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-3 space-y-1.5 text-xs">
                  {match.h2h.results.map((r: any, idx: number) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between"
                    >
                      <span className="text-slate-500">
                        {new Date(r.date).toLocaleDateString("fr-FR")}
                      </span>
                      <span className="font-medium text-slate-900">
                        {r.score}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          {/* IA + stats match regroupés */}
          <section className="rounded-3xl border border-slate-200 bg-white px-5 py-4 space-y-4 shadow-sm">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
              {/* IA */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-slate-900">
                    Prédictions IA ZoneStat
                  </h2>
                  <span className="text-[11px] text-slate-500">
                    Probabilités internes
                  </span>
                </div>

                {!match.predictions ? (
                  <p className="text-sm text-slate-500">
                    Les prédictions IA ne sont pas encore disponibles pour ce
                    match.
                  </p>
                ) : (
                  <div className="space-y-2 text-sm">
                    <div>
                      <div className="flex justify_between text-xs">
                        <span className="text-slate-600">
                          Victoire domicile
                        </span>
                        <span className="font-medium text-slate-900">
                          {match.predictions.homeWinProb}%
                        </span>
                      </div>
                      <PercentageBar
                        value={match.predictions.homeWinProb ?? 0}
                        thickness="h-1.5"
                      />
                    </div>
                    <div>
                      <div className="flex justify_between text-xs">
                        <span className="text-slate-600">Match nul</span>
                        <span className="font-medium text-slate-900">
                          {match.predictions.drawProb}%
                        </span>
                      </div>
                      <PercentageBar
                        value={match.predictions.drawProb ?? 0}
                        thickness="h-1.5"
                      />
                    </div>
                    <div>
                      <div className="flex justify_between text-xs">
                        <span className="text-slate-600">
                          Victoire extérieur
                        </span>
                        <span className="font-medium text-slate-900">
                          {match.predictions.awayWinProb}%
                        </span>
                      </div>
                      <PercentageBar
                        value={match.predictions.awayWinProb ?? 0}
                        thickness="h-1.5"
                      />
                    </div>

                    <div className="border-t border-slate-200 pt-3 text-xs space-y-1.5">
                      <p>
                        <span className="text-slate-500">
                          Score probable :{" "}
                        </span>
                        <span className="font-semibold text-slate-900">
                          {match.predictions.scoreProbable}
                        </span>
                      </p>
                      <p className="text-slate-500">
                        Confiance IA :{" "}
                        <span className="font-medium text-slate-900">
                          {match.predictions.confiance}
                        </span>
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Support de réflexion, pas validation automatique.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Stats match */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-slate-900">
                    Statistiques match
                  </h2>
                  <span className="text-[11px] text-slate-500">
                    Si match joué / en cours
                  </span>
                </div>

                {!match.stats ? (
                  <p className="text-sm text-slate-500">
                    Les statistiques ne sont disponibles que pour les matchs
                    déjà joués ou en direct.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="space-y-1.5">
                      <p className="font-semibold text-slate-900 mb-1">
                        {match.homeTeam}
                      </p>
                      <p className="text-slate-600">
                        Tirs : {match.stats.shots_home}
                      </p>
                      <p className="text-slate-600">
                        Tirs cadrés : {match.stats.shots_on_target_home}
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <p className="font-semibold text-slate-900 mb-1">
                        {match.awayTeam}
                      </p>
                      <p className="text-slate-600">
                        Tirs : {match.stats.shots_away}
                      </p>
                      <p className="text-slate-600">
                        Tirs cadrés : {match.stats.shots_on_target_away}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
