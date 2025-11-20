// src/services/generateDashboardForDate.ts

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  fetchFixturesByDate,
  fetchStatsForFixture,
  fetchTeamSeasonStats,
  fetchLeagueStandings,
  type ApiFootballFixture,
  type MatchExtraData,
  type TeamSeasonStats,
  type LeagueStandingRow,
} from "@/lib/apiFootball";

export type RiskLevel = "low" | "medium" | "high";

export type TeamSeasonProfile = TeamSeasonStats;

export type TeamStandingProfile = {
  rank: number;
  points: number;
  goals_diff: number;
  form?: string | null;
};

export type MatchFull = {
  id: string;
  league: string;
  kickoff: string;

  homeTeam: string;
  homeLogo?: string | null;
  awayTeam: string;
  awayLogo?: string | null;

  tags: string[];
  note: string;
  riskLevel: RiskLevel;

  over15Prob: number;
  over25Prob: number;
  bttsProb: number;

  stats?: MatchExtraData["stats"] | null;
  form?: MatchExtraData["form"] | null;
  h2h?: MatchExtraData["h2h"] | null;

  homeSeason?: TeamSeasonProfile | null;
  awaySeason?: TeamSeasonProfile | null;

  homeStanding?: TeamStandingProfile | null;
  awayStanding?: TeamStandingProfile | null;

  predictions?: {
    homeWinProb: number;
    drawProb: number;
    awayWinProb: number;
    scoreProbable: string;
    confiance: "low" | "medium" | "high";
  };
};

export type DashboardPayload = {
  matches: MatchFull[];
};

/* ============================================================
   UTILS LIGUES / RISQUE / TAGS / NOTE
============================================================ */

function simpleProbFromLeague(leagueName: string) {
  const ln = leagueName.toLowerCase();

  if (
    ln.includes("premier league") ||
    ln.includes("bundesliga") ||
    ln.includes("eredivisie")
  ) {
    return { over15: 80, over25: 65, btts: 60 };
  }

  if (
    ln.includes("ligue 1") ||
    ln.includes("la liga") ||
    ln.includes("serie a")
  ) {
    return { over15: 75, over25: 58, btts: 55 };
  }

  return { over15: 70, over25: 52, btts: 50 };
}

function computeRiskLevelFromLeague(leagueName: string): RiskLevel {
  const ln = leagueName.toLowerCase();
  if (ln.includes("ligue 2") || ln.includes("championship")) return "high";
  if (
    ln.includes("premier league") ||
    ln.includes("la liga") ||
    ln.includes("serie a")
  )
    return "medium";
  return "low";
}

function buildTags(
  f: ApiFootballFixture,
  over25Prob: number,
  bttsProb: number,
): string[] {
  const tags: string[] = [];

  if (over25Prob >= 65) tags.push("Match potentiellement ouvert");
  if (bttsProb >= 60) tags.push("Les deux équipes peuvent marquer");
  if (over25Prob <= 45) tags.push("Plutôt fermé");

  tags.push(f.league.name);

  return tags.slice(0, 3);
}

function buildNote(
  f: ApiFootballFixture,
  over25Prob: number,
  risk: RiskLevel,
): string {
  const home = f.teams.home.name;
  const away = f.teams.away.name;

  if (over25Prob >= 65) {
    return `${home} et ${away} évoluent dans une ligue plutôt portée sur les buts. Potentiel intéressant pour un match ouvert, à recouper avec les compos.`;
  }

  if (over25Prob <= 45) {
    return `La ligue de ${home} - ${away} a tendance à produire des matchs plus fermés. Attention à ne pas sur-estimer le nombre de buts.`;
  }

  if (risk === "high") {
    return `Beaucoup de volatilité dans ce type de matchs, profil assez piégeux. À analyser avec le contexte (forme, calendrier, blessés).`;
  }

  if (risk === "low") {
    return `Profil relativement stable, peu de surprises en général sur ce type d’affiche. À surveiller pour confirmation avec les stats plus fines.`;
  }

  return `Match globalement équilibré entre ${home} et ${away}, à suivre avec les infos de compo et de forme du moment.`;
}

/* ============================================================
   IA SIMPLE
============================================================ */

function computeSimpleIA(m: {
  over25Prob: number;
  bttsProb: number;
  form?: {
    home_goals_scored: number;
    away_goals_scored: number;
  } | null;
}) {
  const base =
    m.over25Prob * 0.4 +
    m.bttsProb * 0.3 +
    (m.form?.home_goals_scored ?? 1) * 2 -
    (m.form?.away_goals_scored ?? 1);

  const home = Math.max(20, Math.min(75, base + 25));
  const draw = Math.max(10, 100 - home - 30);
  const away = Math.max(15, 100 - home - draw);

  return {
    homeWinProb: Math.round(home),
    drawProb: Math.round(draw),
    awayWinProb: Math.round(away),
    scoreProbable: home > away ? "2-1" : "1-2",
    confiance:
      home > 60 || away > 60
        ? ("high" as const)
        : home > 50
        ? ("medium" as const)
        : ("low" as const),
  };
}

/* ============================================================
   FONCTION PRINCIPALE DU CRON
============================================================ */

export async function generateAndStoreDashboardForDate(dateStr: string) {
  const fixtures = await fetchFixturesByDate(dateStr);

  const matches: MatchFull[] = [];

  // caches pour limiter les appels API
  const teamSeasonCache = new Map<string, TeamSeasonStats | null>();
  const leagueStandingsCache = new Map<string, LeagueStandingRow[] | null>();

  for (const f of fixtures) {
    const leagueId = f.league.id;
    const season = f.league.season;

    const leagueKey = `${leagueId}-${season ?? "current"}`;

    // helpers internes avec cache
    const getStandings = async () => {
      if (!leagueStandingsCache.has(leagueKey)) {
        const s = await fetchLeagueStandings(leagueId, season);
        leagueStandingsCache.set(leagueKey, s);
      }
      return leagueStandingsCache.get(leagueKey) ?? null;
    };

    const getTeamSeason = async (teamId: number) => {
      const key = `${leagueKey}-${teamId}`;
      if (!teamSeasonCache.has(key)) {
        const s = await fetchTeamSeasonStats(teamId, leagueId, season);
        teamSeasonCache.set(key, s);
      }
      return teamSeasonCache.get(key) ?? null;
    };

    const probs = simpleProbFromLeague(f.league.name);
    const riskLevel = computeRiskLevelFromLeague(f.league.name);
    const tags = buildTags(f, probs.over25, probs.btts);
    const note = buildNote(f, probs.over25, riskLevel);

    const [extra, standings, homeSeason, awaySeason] = await Promise.all([
      fetchStatsForFixture({
        fixtureId: f.fixture.id,
        homeTeamId: f.teams.home.id,
        awayTeamId: f.teams.away.id,
      }),
      getStandings(),
      getTeamSeason(f.teams.home.id),
      getTeamSeason(f.teams.away.id),
    ]);

    let homeStanding: TeamStandingProfile | null = null;
    let awayStanding: TeamStandingProfile | null = null;

    if (standings && standings.length > 0) {
      const homeRow = standings.find((r) => r.teamId === f.teams.home.id);
      const awayRow = standings.find((r) => r.teamId === f.teams.away.id);

      if (homeRow) {
        homeStanding = {
          rank: homeRow.rank,
          points: homeRow.points,
          goals_diff: homeRow.goals_diff,
          form: homeRow.form ?? null,
        };
      }

      if (awayRow) {
        awayStanding = {
          rank: awayRow.rank,
          points: awayRow.points,
          goals_diff: awayRow.goals_diff,
          form: awayRow.form ?? null,
        };
      }
    }

    const baseMatch: MatchFull = {
      id: String(f.fixture.id),
      league: `${f.league.name} (${f.league.country})`,
      kickoff: f.fixture.date,
      homeTeam: f.teams.home.name,
      homeLogo: f.teams.home.logo ?? null,
      awayTeam: f.teams.away.name,
      awayLogo: f.teams.away.logo ?? null,
      tags,
      note,
      riskLevel,
      over15Prob: probs.over15,
      over25Prob: probs.over25,
      bttsProb: probs.btts,
      stats: extra.stats,
      form: extra.form,
      h2h: extra.h2h,
      homeSeason,
      awaySeason,
      homeStanding,
      awayStanding,
    };

    const predictions = computeSimpleIA({
      over25Prob: baseMatch.over25Prob,
      bttsProb: baseMatch.bttsProb,
      form: baseMatch.form
        ? {
            home_goals_scored: baseMatch.form.home_goals_scored,
            away_goals_scored: baseMatch.form.away_goals_scored,
          }
        : null,
    });

    matches.push({
      ...baseMatch,
      predictions,
    });
  }

  const payload: DashboardPayload = { matches };

  const { error } = await supabaseAdmin
    .from("daily_dashboards")
    .upsert(
      {
        date: dateStr,
        data: payload,
        generated_at: new Date().toISOString(),
        generation_notes: `Généré automatiquement pour ${dateStr} avec API-FOOTBALL (stats + forme + H2H + saison + classement) & IA simple`,
      },
      { onConflict: "date" },
    );

  if (error) {
    console.error("[dashboardCron] Supabase upsert error", error);
    throw error;
  }

  return payload;
}
