// src/lib/apiFootball.ts

const API_KEY = process.env.API_FOOTBALL_API_KEY;
const API_BASE_URL =
  process.env.API_FOOTBALL_BASE_URL ?? "https://v3.football.api-sports.io";
const API_TIMEZONE = process.env.API_FOOTBALL_TIMEZONE ?? "Europe/Paris";

const LEAGUES_FILTER = (process.env.API_FOOTBALL_LEAGUES ?? "")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);

export type ApiFootballFixture = {
  fixture: {
    id: number;
    date: string; // ISO string
  };
  league: {
    id: number;
    name: string;
    country: string;
  };
  teams: {
    home: { id: number; name: string };
    away: { id: number; name: string };
  };
  goals: {
    home: number | null;
    away: number | null;
  };
};

export async function fetchFixturesByDate(
  dateStr: string,
): Promise<ApiFootballFixture[]> {
  if (!API_KEY) {
    console.warn("[apiFootball] API_FOOTBALL_API_KEY manquante");
    return [];
  }

  const url = new URL("/fixtures", API_BASE_URL);
  url.searchParams.set("date", dateStr);          // format YYYY-MM-DD
  url.searchParams.set("timezone", API_TIMEZONE); // ex: Europe/Paris

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "x-apisports-key": API_KEY,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[apiFootball] fixtures error", res.status, text);
    return [];
  }

  const json = await res.json();
  const data = (json?.response ?? []) as ApiFootballFixture[];

  // Filtre par ligues si configuré
  const filtered = LEAGUES_FILTER.length
    ? data.filter((m) => LEAGUES_FILTER.includes(String(m.league.id)))
    : data;

  return filtered;
}
