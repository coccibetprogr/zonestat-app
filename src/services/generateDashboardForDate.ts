// src/services/generateDashboardForDate.ts
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// À adapter à ton vrai provider
type TeamFormInput = {
  matchesPlayed: number;
  goalsFor: number;
  goalsAgainst: number;
  wins: number;
  draws: number;
  losses: number;
  over15Count: number;
  over25Count: number;
  bttsCount: number;
};

type RawMatch = {
  id: string;
  league: string;
  kickoff: string;
  homeTeam: string;
  awayTeam: string;
  homeForm: TeamFormInput;
  awayForm: TeamFormInput;
};

type RiskLevel = "low" | "medium" | "high";

export type MatchInsight = {
  id: string;
  league: string;
  kickoff: string;
  homeTeam: string;
  awayTeam: string;
  tags: string[];
  note: string;
  riskLevel: RiskLevel;
  over15Prob: number;
  over25Prob: number;
  bttsProb: number;
};

export type DashboardPayload = {
  matches: MatchInsight[];
};

const FOOTBALL_API_BASE_URL = process.env.FOOTBALL_API_BASE_URL;
const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY;

function ratio(value: number, total: number): number {
  if (!total || total <= 0) return 0;
  return value / total;
}

function estimateOverProb(overCount: number, matches: number): number {
  const r = ratio(overCount, matches);
  return Math.round(20 + r * 75); // mapping simple 0–1 → 20–95%
}

function estimateBttsProb(bttsCount: number, matches: number): number {
  const r = ratio(bttsCount, matches);
  return Math.round(15 + r * 80);
}

function computeRiskLevel(
  home: TeamFormInput,
  away: TeamFormInput,
): RiskLevel {
  const totalMatches = home.matchesPlayed + away.matchesPlayed;
  if (totalMatches < 6) return "high";

  const homeWinRatio = ratio(home.wins, home.matchesPlayed || 1);
  const awayWinRatio = ratio(away.wins, away.matchesPlayed || 1);
  const diff = Math.abs(homeWinRatio - awayWinRatio);

  if (diff > 0.35) return "low";
  if (diff > 0.18) return "medium";
  return "high";
}

function buildTags(m: RawMatch, over25Prob: number, bttsProb: number): string[] {
  const tags: string[] = [];

  if (over25Prob >= 70) tags.push("Match à buts");
  if (bttsProb >= 65) tags.push("Les deux équipes marquent souvent");
  if (over25Prob <= 35) tags.push("Plutôt fermé");
  if (m.homeForm.wins > m.homeForm.losses) tags.push(`Forme ${m.homeTeam}`);
  if (m.awayForm.wins > m.awayForm.losses) tags.push(`Forme ${m.awayTeam}`);

  return tags.slice(0, 3);
}

function buildNote(m: RawMatch, over25Prob: number, risk: RiskLevel): string {
  const isOpen = over25Prob >= 65;
  const isTight = over25Prob <= 40;

  if (isOpen) {
    return `${m.homeTeam} et ${m.awayTeam} produisent beaucoup d’occasions, profils favorables à un match ouvert.`;
  }
  if (isTight) {
    return `Profil plutôt fermé : une des deux équipes a du mal à créer des occasions franches.`;
  }

  if (risk === "low") {
    return `Dynamique assez claire sur les dernières rencontres, scénario globalement prévisible.`;
  }
  if (risk === "high") {
    return `Beaucoup d’incertitudes (forme, adversaires, contexte), match potentiellement piégeux.`;
  }

  return `Match équilibré sur le papier, à recouper avec le contexte (blessés, calendrier, compositions).`;
}

async function fetchMatchesForDate(dateStr: string): Promise<RawMatch[]> {
  if (!FOOTBALL_API_BASE_URL || !FOOTBALL_API_KEY) {
    console.warn("[dashboardCron] FOOTBALL_API_* non configurés");
    return [];
  }

  const url = new URL("/matches", FOOTBALL_API_BASE_URL);
  url.searchParams.set("date", dateStr);

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${FOOTBALL_API_KEY}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    console.error("[dashboardCron] API error", res.status, await res.text());
    return [];
  }

  const data = await res.json();

  // ⚠️ ADAPTER à la forme réelle de ton provider
  const matches: RawMatch[] = data.matches.map((m: any) => ({
    id: String(m.id),
    league: m.league.name,
    kickoff: m.kickoff,
    homeTeam: m.home.name,
    awayTeam: m.away.name,
    homeForm: {
      matchesPlayed: m.home.form.matches,
      goalsFor: m.home.form.goals_for,
      goalsAgainst: m.home.form.goals_against,
      wins: m.home.form.wins,
      draws: m.home.form.draws,
      losses: m.home.form.losses,
      over15Count: m.home.form.over_15,
      over25Count: m.home.form.over_25,
      bttsCount: m.home.form.btts,
    },
    awayForm: {
      matchesPlayed: m.away.form.matches,
      goalsFor: m.away.form.goals_for,
      goalsAgainst: m.away.form.goals_against,
      wins: m.away.form.wins,
      draws: m.away.form.draws,
      losses: m.away.form.losses,
      over15Count: m.away.form.over_15,
      over25Count: m.away.form.over_25,
      bttsCount: m.away.form.btts,
    },
  }));

  return matches;
}

export async function generateAndStoreDashboardForDate(dateStr: string) {
  const rawMatches = await fetchMatchesForDate(dateStr);

  const matches: MatchInsight[] = rawMatches.map((m) => {
    const over15ProbHome = estimateOverProb(m.homeForm.over15Count, m.homeForm.matchesPlayed);
    const over15ProbAway = estimateOverProb(m.awayForm.over15Count, m.awayForm.matchesPlayed);
    const over25ProbHome = estimateOverProb(m.homeForm.over25Count, m.homeForm.matchesPlayed);
    const over25ProbAway = estimateOverProb(m.awayForm.over25Count, m.awayForm.matchesPlayed);
    const bttsProbHome = estimateBttsProb(m.homeForm.bttsCount, m.homeForm.matchesPlayed);
    const bttsProbAway = estimateBttsProb(m.awayForm.bttsCount, m.awayForm.matchesPlayed);

    const over15Prob = Math.round((over15ProbHome + over15ProbAway) / 2);
    const over25Prob = Math.round((over25ProbHome + over25ProbAway) / 2);
    const bttsProb = Math.round((bttsProbHome + bttsProbAway) / 2);
    const riskLevel = computeRiskLevel(m.homeForm, m.awayForm);
    const tags = buildTags(m, over25Prob, bttsProb);
    const note = buildNote(m, over25Prob, riskLevel);

    return {
      id: m.id,
      league: m.league,
      kickoff: m.kickoff,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      tags,
      note,
      riskLevel,
      over15Prob,
      over25Prob,
      bttsProb,
    };
  });

  const payload: DashboardPayload = {
    matches,
  };

  // Upsert dans daily_dashboards
  const { error } = await supabaseAdmin
    .from("daily_dashboards")
    .upsert(
      {
        date: dateStr,
        data: payload,
        generated_at: new Date().toISOString(),
        generation_notes: `Généré automatiquement pour ${dateStr}`,
      },
      { onConflict: "date" },
    );

  if (error) {
    console.error("[dashboardCron] Supabase upsert error", error);
    throw error;
  }

  return payload;
}
