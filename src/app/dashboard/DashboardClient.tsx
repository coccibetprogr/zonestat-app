"use client";

import { useMemo, useState } from "react";
import { Search, Filter, Clock, PencilLine, X } from "lucide-react";

type Importance = "high" | "medium" | "low";
type PredictionOutcome = "none" | "home" | "draw" | "away";

// Match brut venant de daily_dashboards.data.matches
// (on laisse RawMatch en any explicite pour éviter les erreurs TypeScript)
type RawMatch = any;

interface EnrichedMatch {
  id: string;
  league: string;
  country?: string;
  timestamp: number;
  hour: string;
  home: string;
  away: string;
  venue?: string;
  importance: Importance;
}

interface LeagueGroup {
  league: string;
  country?: string;
  matches: EnrichedMatch[];
}

interface DashboardClientProps {
  date: string;       // ex: "2025-11-18"
  matches: RawMatch[]; // daily_dashboards.data.matches
}

interface UserPrediction {
  outcome: PredictionOutcome;
  note: string;
  noteOpen: boolean;
}

const defaultPrediction: UserPrediction = {
  outcome: "none",
  note: "",
  noteOpen: false,
};

function computeImportance(leagueName: string): Importance {
  const name = leagueName.toLowerCase();
  if (
    name.includes("premier league") ||
    name.includes("ligue 1") ||
    name.includes("serie a") ||
    name.includes("la liga") ||
    name.includes("bundesliga") ||
    name.includes("champions league")
  ) {
    return "high";
  }
  if (name.includes("division") || name.includes("cup")) {
    return "low";
  }
  return "medium";
}

/**
 * Normalise un match vers un format interne,
 * en couvrant un maximum de variantes possibles de champs.
 */
function normalize(raw: RawMatch): EnrichedMatch {
  const r = raw as any;

  const fixture = r.fixture ?? {};
  const leagueObj = r.league ?? {};

  // 🏆 Ligue
  const leagueName: string =
    leagueObj.name ??
    r.leagueName ??
    r.league_name ??
    r.competition ??
    r.competition_name ??
    "Compétition";

  const country: string | undefined =
    leagueObj.country ?? r.country ?? r.country_name ?? undefined;

  // 🏟️ Équipes – ratisse large
  const home: string =
    r.teams?.home?.name ??
    r.homeTeam ??
    r.home_team ??
    r.homeTeamName ??
    r.home_team_name ??
    r.home_name ??
    r.home ??
    r.localTeam?.name ??
    "Équipe A";

  const away: string =
    r.teams?.away?.name ??
    r.awayTeam ??
    r.away_team ??
    r.awayTeamName ??
    r.away_team_name ??
    r.away_name ??
    r.away ??
    r.visitorTeam?.name ??
    "Équipe B";

  // ⏰ Horaire
  let timestamp = 0;

  if (typeof fixture.timestamp === "number") {
    timestamp = fixture.timestamp;
  } else if (fixture.date) {
    timestamp = Math.floor(new Date(fixture.date).getTime() / 1000);
  } else if (r.kickoff || r.kickOff || r.start_at) {
    const d = r.kickoff ?? r.kickOff ?? r.start_at;
    timestamp = Math.floor(new Date(d).getTime() / 1000);
  }

  const dateObj = timestamp ? new Date(timestamp * 1000) : new Date(NaN);

  const hour = timestamp
    ? dateObj.toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "--:--";

  const importance = computeImportance(leagueName);

  const id: string = String(
    fixture.id ??
      r.id ??
      `${home}-${away}-${timestamp || Date.now() / 1000}`
  );

  const venue: string | undefined =
    fixture.venue?.name ??
    r.venue ??
    r.stadium ??
    r.venue_name ??
    undefined;

  return {
    id,
    league: leagueName,
    country,
    timestamp,
    hour,
    home,
    away,
    venue,
    importance,
  };
}

export default function DashboardClient({
  date,
  matches,
}: DashboardClientProps) {
  const [search, setSearch] = useState<string>("");
  const [importance, setImportance] = useState<"all" | Importance>("all");
  const [predictions, setPredictions] = useState<Record<string, UserPrediction>>(
    {}
  );

  const items: EnrichedMatch[] = useMemo(
    () => matches.map((raw: RawMatch) => normalize(raw)),
    [matches]
  );

  const leagues: LeagueGroup[] = useMemo(() => {
    const map = new Map<string, LeagueGroup>();

    items.forEach((m: EnrichedMatch) => {
      const existing = map.get(m.league);
      if (existing) {
        existing.matches.push(m);
      } else {
        map.set(m.league, {
          league: m.league,
          country: m.country,
          matches: [m],
        });
      }
    });

    return Array.from(map.values()).sort(
      (a: LeagueGroup, b: LeagueGroup) => b.matches.length - a.matches.length
    );
  }, [items]);

  const filteredLeagues: LeagueGroup[] = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();

    return leagues
      .map((lg: LeagueGroup) => {
        const filteredMatches = lg.matches
          .filter((m: EnrichedMatch) =>
            importance === "all" ? true : m.importance === importance
          )
          .filter((m: EnrichedMatch) => {
            if (!searchTerm) return true;
            return (
              m.home.toLowerCase().includes(searchTerm) ||
              m.away.toLowerCase().includes(searchTerm) ||
              m.league.toLowerCase().includes(searchTerm)
            );
          })
          .sort(
            (a: EnrichedMatch, b: EnrichedMatch) =>
              a.timestamp - b.timestamp
          );

        return {
          ...lg,
          matches: filteredMatches,
        };
      })
      .filter((lg: LeagueGroup) => lg.matches.length > 0);
  }, [leagues, importance, search]);

  const readableDate = useMemo(() => {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return date;
    return d.toLocaleDateString("fr-FR", {
      weekday: "long",
      month: "long",
      year: "numeric",
      day: "numeric",
    });
  }, [date]);

  const totalMatches = items.length;

  const predictedCount = useMemo(
    () =>
      Object.values(predictions).filter(
        (p) => p.outcome !== "none" || p.note.trim().length > 0
      ).length,
    [predictions]
  );

  const updatePrediction = (
    matchId: string,
    partial: Partial<UserPrediction>
  ) => {
    setPredictions((prev) => {
      const current = prev[matchId] ?? defaultPrediction;
      return {
        ...prev,
        [matchId]: {
          ...current,
          ...partial,
        },
      };
    });
  };

  const outcomeLabel: Record<PredictionOutcome, string> = {
    none: "Pas de prono",
    home: "Domicile",
    draw: "Nul",
    away: "Extérieur",
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-10">
      {/* HEADER */}
      <header className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-line bg-bg-soft px-4 py-1.5 text-xs uppercase tracking-widest">
          <div className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]" />
          <span>Dashboard du jour</span>
        </div>

        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-fg">
            Matchs du {readableDate}
          </h1>
          <p className="text-sm text-fg-muted">
            {totalMatches} match
            {totalMatches > 1 ? "s" : ""} analysé
            {totalMatches > 1 ? "s" : ""} via le moteur ZoneStat (cache
            API-Football).
          </p>
          {predictedCount > 0 && (
            <p className="text-xs text-fg-subtle">
              Tu as déjà posé un prono ou une note sur{" "}
              <span className="font-medium text-fg">
                {predictedCount} match
                {predictedCount > 1 ? "s" : ""}
              </span>
              .
            </p>
          )}
        </div>
      </header>

      {/* FILTRES */}
      <section className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          {/* Recherche */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-fg-muted">
              Recherche
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle h-4 w-4" />
              <input
                className="w-full bg-bg-soft border border-line rounded-md pl-10 pr-3 py-2 text-sm text-fg placeholder:text-fg-subtle"
                placeholder="PSG, Premier League, Milan..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Importance */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-fg-muted flex items-center gap-2">
              <Filter className="h-3.5 w-3.5" />
              Importance
            </label>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { key: "all", label: "Tous" },
                  { key: "high", label: "Gros matchs" },
                  { key: "medium", label: "Intéressants" },
                  { key: "low", label: "Secondaires" },
                ] as { key: "all" | Importance; label: string }[]
              ).map((btn) => (
                <button
                  key={btn.key}
                  type="button"
                  className={`px-3 py-1 text-xs rounded-full border transition ${
                    importance === btn.key
                      ? "border-[var(--color-primary)] text-[var(--color-primary)] bg-bg-soft"
                      : "border-line text-fg-muted bg-white hover:bg-bg-soft"
                  }`}
                  onClick={() => setImportance(btn.key)}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* LISTE GROUPÉE PAR LIGUE */}
      <section className="space-y-8">
        {filteredLeagues.length === 0 && (
          <div className="text-center text-fg-muted py-10 border border-dashed border-line rounded-lg bg-bg-soft text-sm">
            Aucun match ne correspond aux filtres.  
            Essaie d&apos;élargir la recherche ou de modifier l&apos;importance.
          </div>
        )}

        {filteredLeagues.map((lg: LeagueGroup) => (
          <div key={lg.league} className="space-y-4">
            {/* Header ligue */}
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-fg">
                  {lg.league}
                </h2>
                <p className="text-xs text-fg-muted">
                  {lg.matches.length} match
                  {lg.matches.length > 1 ? "s" : ""} aujourd&apos;hui
                </p>
              </div>
              {lg.country && (
                <p className="text-xs text-fg-subtle">{lg.country}</p>
              )}
            </div>

            {/* Matchs de la ligue */}
            <div className="space-y-2">
              {lg.matches.map((m: EnrichedMatch) => {
                const prediction = predictions[m.id] ?? defaultPrediction;

                return (
                  <div
                    key={m.id}
                    className="card p-4 space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      {/* Heure + stade */}
                      <div className="flex items-center gap-3 text-xs text-fg-subtle w-full sm:w-40">
                        <div className="flex items-center gap-2">
                          <Clock className="h-3.5 w-3.5" />
                          <span>{m.hour}</span>
                        </div>
                        {m.venue && (
                          <span className="hidden sm:inline truncate">
                            · {m.venue}
                          </span>
                        )}
                      </div>

                      {/* Équipes */}
                      <div className="flex-1 text-sm font-medium text-fg text-center sm:text-left">
                        {m.home}
                        <span className="text-fg-subtle mx-2">vs</span>
                        {m.away}
                      </div>

                      {/* Importance */}
                      <div className="text-xs text-right min-w-[100px]">
                        {m.importance === "high" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
                            Gros match
                          </span>
                        )}
                        {m.importance === "medium" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                            Intéressant
                          </span>
                        )}
                        {m.importance === "low" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-50 text-slate-600 border border-slate-200">
                            Secondaire
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Zone PRONO */}
                    <div className="border-t border-line pt-3 space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <p className="text-xs font-medium text-fg-muted">
                          Ton prono rapide
                          {prediction.outcome !== "none" && (
                            <span className="ml-2 text-[11px] text-fg-subtle">
                              ({outcomeLabel[prediction.outcome]})
                            </span>
                          )}
                        </p>

                        <div className="flex flex-wrap gap-2 text-xs">
                          <button
                            type="button"
                            onClick={() =>
                              updatePrediction(m.id, { outcome: "home" })
                            }
                            className={`px-3 py-1 rounded-full border ${
                              prediction.outcome === "home"
                                ? "border-emerald-500 text-emerald-700 bg-emerald-50"
                                : "border-line text-fg-muted bg-white hover:bg-bg-soft"
                            }`}
                          >
                            Domicile
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updatePrediction(m.id, { outcome: "draw" })
                            }
                            className={`px-3 py-1 rounded-full border ${
                              prediction.outcome === "draw"
                                ? "border-sky-500 text-sky-700 bg-sky-50"
                                : "border-line text-fg-muted bg-white hover:bg-bg-soft"
                            }`}
                          >
                            Nul
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updatePrediction(m.id, { outcome: "away" })
                            }
                            className={`px-3 py-1 rounded-full border ${
                              prediction.outcome === "away"
                                ? "border-orange-500 text-orange-700 bg-orange-50"
                                : "border-line text-fg-muted bg-white hover:bg-bg-soft"
                            }`}
                          >
                            Extérieur
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updatePrediction(m.id, { outcome: "none" })
                            }
                            className="px-3 py-1 rounded-full border border-line text-xs text-fg-subtle bg-white hover:bg-bg-soft inline-flex items-center gap-1"
                          >
                            <X className="h-3 w-3" />
                            Passer
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              updatePrediction(m.id, {
                                noteOpen: !prediction.noteOpen,
                              })
                            }
                            className="px-3 py-1 rounded-full border border-line text-xs text-fg-muted bg-bg-soft hover:bg-white inline-flex items-center gap-1"
                          >
                            <PencilLine className="h-3 w-3" />
                            Note
                          </button>
                        </div>
                      </div>

                      {prediction.noteOpen && (
                        <div className="pt-1">
                          <textarea
                            rows={2}
                            placeholder="Tes raisons, contexte, stats clés..."
                            className="w-full rounded-md border border-line bg-bg-soft px-3 py-2 text-xs text-fg placeholder:text-fg-subtle"
                            value={prediction.note}
                            onChange={(e) =>
                              updatePrediction(m.id, {
                                note: e.target.value,
                              })
                            }
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
