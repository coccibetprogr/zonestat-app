// src/lib/apiFootball.ts

const API_KEY = process.env.API_FOOTBALL_API_KEY;
const API_BASE_URL =
  process.env.API_FOOTBALL_BASE_URL ?? "https://v3.football.api-sports.io";
const API_TIMEZONE = process.env.API_FOOTBALL_TIMEZONE ?? "Europe/Paris";
const API_SEASON =
  process.env.API_FOOTBALL_SEASON ?? new Date().getFullYear().toString();

const LEAGUES_FILTER = (process.env.API_FOOTBALL_LEAGUES ?? "")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);

function buildUrl(
  path: string,
  params: Record<string, string | number | undefined> = {},
) {
  const url = new URL(path, API_BASE_URL);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

async function apiGet(
  path: string,
  params: Record<string, string | number | undefined> = {},
) {
  if (!API_KEY) {
    console.warn("[apiFootball] API_FOOTBALL_API_KEY manquante");
    return null;
  }

  const url = buildUrl(path, params);

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "x-apisports-key": API_KEY,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[apiFootball]", path, "error", res.status, text);
    return null;
  }

  const json = await res.json();
  return json?.response ?? null;
}

/* ============================================================
   TYPES DE BASE
============================================================ */

export type ApiFootballFixture = {
  fixture: {
    id: number;
    date: string;
  };
  league: {
    id: number;
    name: string;
    country: string;
    season?: number;
  };
  teams: {
    home: { id: number; name: string; logo?: string | null };
    away: { id: number; name: string; logo?: string | null };
  };
  goals: {
    home: number | null;
    away: number | null;
  };
};

/* ============================================================
   FETCH — MATCHS PAR DATE
============================================================ */

export async function fetchFixturesByDate(
  dateStr: string,
): Promise<ApiFootballFixture[]> {
  const response = await apiGet("/fixtures", {
    date: dateStr,
    timezone: API_TIMEZONE,
  });

  if (!response || !Array.isArray(response)) return [];

  const data = response as ApiFootballFixture[];

  const filtered = LEAGUES_FILTER.length
    ? data.filter((m) => LEAGUES_FILTER.includes(String(m.league.id)))
    : data;

  return filtered;
}

/* ============================================================
   BLOCS STATS / FORME / H2H POUR UN MATCH
============================================================ */

export type StatsBlock = {
  xg_home: number;
  xg_away: number;
  shots_home: number;
  shots_away: number;
  shots_on_target_home: number;
  shots_on_target_away: number;
};

export type FormBlock = {
  home_last5: string[];
  away_last5: string[];
  home_goals_scored: number;
  home_goals_conceded: number;
  away_goals_scored: number;
  away_goals_conceded: number;
  home_xg_last5: number;
  away_xg_last5: number;
};

export type H2HBlock = {
  results: Array<{
    date: string;
    score: string;
    xg_home: number;
    xg_away: number;
  }>;
  tendances: {
    btts: number;
    over25: number;
  };
};

export type MatchExtraData = {
  stats: StatsBlock | null;
  form: FormBlock | null;
  h2h: H2HBlock | null;
};

function getNumberStat(row: any, type: string): number {
  const stat = row?.statistics?.find((s: any) => s.type === type);
  const val = stat?.value;
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    const parsed = parseFloat(val);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

async function fetchFixtureStatistics(
  fixtureId: number | string,
): Promise<StatsBlock | null> {
  const response = await apiGet("/fixtures/statistics", {
    fixture: fixtureId,
  });

  if (!response || !Array.isArray(response) || response.length < 2) {
    return null;
  }

  const homeRow = response[0];
  const awayRow = response[1];

  const shots_home = getNumberStat(homeRow, "Total Shots");
  const shots_away = getNumberStat(awayRow, "Total Shots");
  const shots_on_target_home = getNumberStat(homeRow, "Shots on Goal");
  const shots_on_target_away = getNumberStat(awayRow, "Shots on Goal");

  return {
    xg_home: 0, // pas dispo dans API-FOOTBALL
    xg_away: 0,
    shots_home,
    shots_away,
    shots_on_target_home,
    shots_on_target_away,
  };
}

type TeamFormResult = {
  last5: string[];
  goals_scored: number;
  goals_conceded: number;
  xg_last5: number;
};

async function fetchTeamLastFixtures(teamId: number): Promise<TeamFormResult> {
  const response = await apiGet("/fixtures", {
    team: teamId,
    last: 5,
    timezone: API_TIMEZONE,
  });

  if (!response || !Array.isArray(response) || response.length === 0) {
    return {
      last5: [],
      goals_scored: 0,
      goals_conceded: 0,
      xg_last5: 0,
    };
  }

  const fixtures = response as ApiFootballFixture[];

  const last5: string[] = [];
  let goals_scored = 0;
  let goals_conceded = 0;

  for (const f of fixtures) {
    const isHome = f.teams.home.id === teamId;
    const gf = isHome ? f.goals.home ?? 0 : f.goals.away ?? 0;
    const ga = isHome ? f.goals.away ?? 0 : f.goals.home ?? 0;

    goals_scored += gf;
    goals_conceded += ga;

    if (gf > ga) last5.push("W");
    else if (gf < ga) last5.push("L");
    else last5.push("D");
  }

  return {
    last5,
    goals_scored,
    goals_conceded,
    xg_last5: 0,
  };
}

async function fetchHeadToHead(
  homeTeamId: number,
  awayTeamId: number,
): Promise<H2HBlock | null> {
  const response = await apiGet("/fixtures/headtohead", {
    h2h: `${homeTeamId}-${awayTeamId}`,
    last: 5,
    timezone: API_TIMEZONE,
  });

  if (!response || !Array.isArray(response) || response.length === 0) {
    return {
      results: [],
      tendances: {
        btts: 50,
        over25: 50,
      },
    };
  }

  const fixtures = response as ApiFootballFixture[];

  const results: H2HBlock["results"] = [];
  let bttsCount = 0;
  let over25Count = 0;

  for (const f of fixtures) {
    const gh = f.goals.home ?? 0;
    const ga = f.goals.away ?? 0;
    const total = gh + ga;

    const btts = gh > 0 && ga > 0;
    const over25 = total >= 3;

    if (btts) bttsCount++;
    if (over25) over25Count++;

    results.push({
      date: f.fixture.date,
      score: `${gh}-${ga}`,
      xg_home: 0,
      xg_away: 0,
    });
  }

  const n = fixtures.length;
  const btts = n > 0 ? Math.round((bttsCount / n) * 100) : 50;
  const over25 = n > 0 ? Math.round((over25Count / n) * 100) : 50;

  return {
    results,
    tendances: {
      btts,
      over25,
    },
  };
}

/* ============================================================
   STATS SAISON PAR ÉQUIPE & CLASSEMENT
============================================================ */

export type TeamSeasonStats = {
  goals_for_avg: number;
  goals_against_avg: number;
  matches_played: number;
  clean_sheet_percent: number;
  failed_to_score_percent: number;
  wins: number;
  draws: number;
  losses: number;
};

export type LeagueStandingRow = {
  teamId: number;
  rank: number;
  points: number;
  goals_diff: number;
  form?: string | null;
};

export async function fetchTeamSeasonStats(
  teamId: number,
  leagueId: number,
  season?: number,
): Promise<TeamSeasonStats | null> {
  const response = await apiGet("/teams/statistics", {
    team: teamId,
    league: leagueId,
    season: season ?? API_SEASON,
  });

  if (!response) return null;

  const data = response as any;

  const fixtures = data.fixtures;
  const goals = data.goals;
  const cleanSheet = data.clean_sheet;
  const failedToScore = data.failed_to_score;

  if (!fixtures || !goals) return null;

  const playedTotal = fixtures.played?.total ?? 0;

  const gfAvgStr = goals.for?.average?.total ?? "0";
  const gaAvgStr = goals.against?.average?.total ?? "0";

  const goals_for_avg = parseFloat(gfAvgStr) || 0;
  const goals_against_avg = parseFloat(gaAvgStr) || 0;

  const wins = fixtures.wins?.total ?? 0;
  const draws = fixtures.draws?.total ?? 0;
  const losses = fixtures.loses?.total ?? 0;

  const cleanTotal = cleanSheet?.total ?? 0;
  const failedTotal = failedToScore?.total ?? 0;

  const clean_sheet_percent =
    playedTotal > 0 ? Math.round((cleanTotal / playedTotal) * 100) : 0;
  const failed_to_score_percent =
    playedTotal > 0 ? Math.round((failedTotal / playedTotal) * 100) : 0;

  return {
    goals_for_avg,
    goals_against_avg,
    matches_played: playedTotal,
    clean_sheet_percent,
    failed_to_score_percent,
    wins,
    draws,
    losses,
  };
}

export async function fetchLeagueStandings(
  leagueId: number,
  season?: number,
): Promise<LeagueStandingRow[] | null> {
  const response = await apiGet("/standings", {
    league: leagueId,
    season: season ?? API_SEASON,
  });

  if (!response || !Array.isArray(response) || response.length === 0) {
    return null;
  }

  const leagueData = (response as any[])[0]?.league;

  const groups = leagueData?.standings;
  if (!groups || !Array.isArray(groups) || groups.length === 0) {
    return null;
  }

  const table = groups[0] as any[];

  const rows: LeagueStandingRow[] = table.map((row: any) => ({
    teamId: row.team?.id,
    rank: row.rank ?? 0,
    points: row.points ?? 0,
    goals_diff: row.goalsDiff ?? 0,
    form: row.form ?? null,
  }));

  return rows;
}

/* ============================================================
   FONCTION PRINCIPALE MATCH EXTRA (stats/form/h2h)
============================================================ */

export async function fetchStatsForFixture(params: {
  fixtureId: number | string;
  homeTeamId: number;
  awayTeamId: number;
}): Promise<MatchExtraData> {
  const { fixtureId, homeTeamId, awayTeamId } = params;

  try {
    const [stats, homeForm, awayForm, h2h] = await Promise.all([
      fetchFixtureStatistics(fixtureId),
      fetchTeamLastFixtures(homeTeamId),
      fetchTeamLastFixtures(awayTeamId),
      fetchHeadToHead(homeTeamId, awayTeamId),
    ]);

    const form: FormBlock | null = {
      home_last5: homeForm.last5,
      away_last5: awayForm.last5,
      home_goals_scored: homeForm.goals_scored,
      home_goals_conceded: homeForm.goals_conceded,
      away_goals_scored: awayForm.goals_scored,
      away_goals_conceded: awayForm.goals_conceded,
      home_xg_last5: homeForm.xg_last5,
      away_xg_last5: awayForm.xg_last5,
    };

    return {
      stats: stats ?? null,
      form,
      h2h: h2h ?? null,
    };
  } catch (err) {
    console.error("[apiFootball] fetchStatsForFixture error", err);
    return {
      stats: null,
      form: null,
      h2h: null,
    };
  }
}
