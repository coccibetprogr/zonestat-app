// src/lib/apiFootball.ts

const API_KEY = process.env.API_FOOTBALL_API_KEY;
const API_BASE_URL =
  process.env.API_FOOTBALL_BASE_URL ?? "https://v3.football.api-sports.io";
const API_TIMEZONE = process.env.API_FOOTBALL_TIMEZONE ?? "Europe/Paris";

const LEAGUES_FILTER = (process.env.API_FOOTBALL_LEAGUES ?? "")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);

function buildUrl(path: string, params: Record<string, string | number | undefined> = {}) {
  const url = new URL(path, API_BASE_URL);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

async function apiGet(path: string, params: Record<string, string | number | undefined> = {}) {
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
  return json?.response ?? [];
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

  if (!response) return [];

  const data = response as ApiFootballFixture[];

  const filtered = LEAGUES_FILTER.length
    ? data.filter((m) => LEAGUES_FILTER.includes(String(m.league.id)))
    : data;

  return filtered;
}

/* ============================================================
   FETCH — STATS / FORM / H2H POUR UN FIXTURE
============================================================ */

type StatsBlock = {
  xg_home: number;
  xg_away: number;
  shots_home: number;
  shots_away: number;
  shots_on_target_home: number;
  shots_on_target_away: number;
};

type FormBlock = {
  home_last5: string[];
  away_last5: string[];
  home_goals_scored: number;
  home_goals_conceded: number;
  away_goals_scored: number;
  away_goals_conceded: number;
  home_xg_last5: number;
  away_xg_last5: number;
};

type H2HBlock = {
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

async function fetchFixtureStatistics(fixtureId: number | string): Promise<StatsBlock | null> {
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

  // API-FOOTBALL ne fournit pas les xG natifs → on laisse à 0 pour l’instant
  return {
    xg_home: 0,
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
    xg_last5: 0, // pas d’xG disponible → à enrichir plus tard via autre source
  };
}

async function fetchHeadToHead(homeTeamId: number, awayTeamId: number): Promise<H2HBlock | null> {
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

/**
 * Fonction principale utilisée par le cron :
 * renvoie stats + forme + h2h pour un match donné.
 */
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
