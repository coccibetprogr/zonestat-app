// src/app/dashboard/DashboardClient.tsx
"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Search, Clock } from "lucide-react";
import Link from "next/link";
import { SportsTabs, type SportTabId } from "@/components/dashboard/sports-tabs";

type Importance = "high" | "medium" | "low";
type PredictionOutcome = "none" | "home" | "draw" | "away";
type SportKind = "football" | "tennis";

// Match brut venant de daily_dashboards.data.matches
type RawMatch = any;

interface DashboardDay {
  date: string;       // "2025-11-22"
  matches: RawMatch[];
}

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
  homeLogo?: string;
  awayLogo?: string;

  dateKey: string;    // "2025-11-22"
  dateLabel: string;  // "Samedi 22/11"
}

interface DashboardClientProps {
  days: DashboardDay[];
}

interface UserPrediction {
  outcome: PredictionOutcome;
  note: string;
  noteOpen: boolean;
  locked: boolean;
  favorite: boolean;
}

interface AiInsight {
  loading: boolean;
  error?: string;
  summary?: string;
  goalsProfile?: string;
  riskLevel?: string;
  confidence?: string;
  suggestedScore?: string;
}

const defaultPrediction: UserPrediction = {
  outcome: "none",
  note: "",
  noteOpen: false,
  locked: false,
  favorite: false,
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

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;

  const weekday = d.toLocaleDateString("fr-FR", { weekday: "long" });
  const day = d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
  });

  // ex: "Samedi 22/11"
  return `${weekday.charAt(0).toUpperCase() + weekday.slice(1)} ${day}`;
}

function normalize(raw: RawMatch, dashboardDate: string): EnrichedMatch {
  const r = raw as any;

  const fixture = r.fixture ?? {};
  const leagueObj = r.league ?? {};

  const leagueName: string =
    leagueObj.name ??
    r.leagueName ??
    r.league_name ??
    r.competition ??
    r.competition_name ??
    (typeof r.league === "string" ? r.league : undefined) ??
    "Compétition";

  const country: string | undefined =
    leagueObj.country ?? r.country ?? r.country_name ?? undefined;

  const home: string =
    r.teams?.home?.name ??
    r.homeTeam ??
    r.homeTeamName ??
    r.home ??
    "Équipe A";

  const away: string =
    r.teams?.away?.name ??
    r.awayTeam ??
    r.awayTeamName ??
    r.away ??
    "Équipe B";

  const homeLogo: string | undefined =
    r.homeLogo ?? r.teams?.home?.logo ?? undefined;

  const awayLogo: string | undefined =
    r.awayLogo ?? r.teams?.away?.logo ?? undefined;

  let timestamp = 0;

  if (fixture.timestamp) {
    timestamp = fixture.timestamp;
  } else if (fixture.date) {
    timestamp = Math.floor(new Date(fixture.date).getTime() / 1000);
  } else if (r.kickoff) {
    timestamp = Math.floor(new Date(r.kickoff).getTime() / 1000);
  } else if (dashboardDate) {
    // fallback : on utilise la date du dashboard + heure 00:00
    timestamp = Math.floor(new Date(dashboardDate).getTime() / 1000);
  }

  const dateObj = timestamp ? new Date(timestamp * 1000) : new Date();
  const hour = timestamp
    ? dateObj.toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "--:--";

  const importance = computeImportance(leagueName);

  const id: string = String(
    fixture.id ?? r.id ?? `${home}-${away}-${timestamp}`
  );

  const venue: string | undefined =
    fixture.venue?.name ?? r.venue ?? r.stadium ?? undefined;

  const dateKey = dashboardDate || dateObj.toISOString().slice(0, 10);
  const dateLabel = formatDayLabel(dateKey);

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
    homeLogo,
    awayLogo,
    dateKey,
    dateLabel,
  };
}

export default function DashboardClient({ days }: DashboardClientProps) {
  const [search, setSearch] = useState<string>("");
  const [importance] = useState<"all" | Importance>("all");
  const [aiInsights, setAiInsights] = useState<Record<string, AiInsight>>({});
  const [visibleCount, setVisibleCount] = useState(100);
  const [sportTab, setSportTab] = useState<SportTabId>("for-you");

  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const items: EnrichedMatch[] = useMemo(
    () =>
      (days ?? [])
        .flatMap((day) =>
          (day.matches ?? []).map((raw) => normalize(raw, day.date)),
        )
        .sort((a, b) => a.timestamp - b.timestamp),
    [days],
  );

  const filteredMatches = useMemo(() => {
    const q = search.trim().toLowerCase();

    return items.filter((m) => {
      if (sportTab !== "for-you" && detectSport(m) !== sportTab) {
        return false;
      }
      if (importance !== "all" && m.importance !== importance) {
        return false;
      }
      if (!q) return true;
      return (
        m.home.toLowerCase().includes(q) ||
        m.away.toLowerCase().includes(q) ||
        m.league.toLowerCase().includes(q)
      );
    });
  }, [items, importance, search, sportTab]);

  useEffect(() => {
    setVisibleCount(100);
  }, [importance, search, sportTab, days]);

  useEffect(() => {
    if (!loadMoreRef.current) return;
    if (visibleCount >= filteredMatches.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) =>
            prev + 50 > filteredMatches.length
              ? filteredMatches.length
              : prev + 50,
          );
        }
      },
      { threshold: 1 },
    );

    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [filteredMatches.length, visibleCount]);

  const visibleMatches = filteredMatches.slice(0, visibleCount);

  const totalMatches = items.length;

  // Regroupement par jour (dateKey)
  const groupedByDate = useMemo(() => {
    const map = new Map<
      string,
      { dateKey: string; dateLabel: string; matches: EnrichedMatch[] }
    >();

    for (const m of visibleMatches) {
      const key = m.dateKey;
      if (!map.has(key)) {
        map.set(key, { dateKey: key, dateLabel: m.dateLabel, matches: [] });
      }
      map.get(key)!.matches.push(m);
    }

    return Array.from(map.values()).sort(
      (a, b) => new Date(a.dateKey).getTime() - new Date(b.dateKey).getTime(),
    );
  }, [visibleMatches]);

  // Label global semaine : "Du ven. 21/11 au jeu. 27/11"
  const weekLabel = useMemo(() => {
    if (!days.length) return "";
    const first = new Date(days[0].date);
    const last = new Date(days[days.length - 1].date);

    if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime())) {
      return "";
    }

    const startStr = first.toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
    });
    const endStr = last.toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
    });

    return `Du ${startStr} au ${endStr}`;
  }, [days]);

  function detectSport(m: EnrichedMatch): SportKind {
    const txt = (
      m.league +
      (m.country ?? "") +
      m.home +
      m.away
    ).toLowerCase();

    if (
      txt.includes("atp") ||
      txt.includes("wta") ||
      txt.includes("challenger") ||
      txt.includes("wimbledon") ||
      txt.includes("us open") ||
      txt.includes("australian open")
    ) {
      return "tennis";
    }
    return "football";
  }

  async function loadAiInsight(match: EnrichedMatch) {
    const matchId = match.id;

    setAiInsights((prev) => ({
      ...prev,
      [matchId]: {
        loading: true,
        error: undefined,
      },
    }));

    try {
      await new Promise((r) => setTimeout(r, 700));

      const fakeSummary =
        `${match.home} affiche une dynamique intéressante. ` +
        `${match.away} peut profiter des espaces. Match rythmé possible.`;

      setAiInsights((prev) => ({
        ...prev,
        [matchId]: {
          loading: false,
          summary: fakeSummary,
          goalsProfile: "Profil +2,5 buts",
          riskLevel: "Modéré",
          confidence: "Confiance moyenne",
          suggestedScore: "2–1",
        },
      }));
    } catch {
      setAiInsights((prev) => ({
        ...prev,
        [matchId]: {
          loading: false,
          error: "Erreur IA.",
        },
      }));
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-0 sm:px-4 py-3 space-y-4">
      {/* HEADER */}
      <header className="space-y-1">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
          Calendrier Ligue 1
        </h1>
        <p className="text-sm text-fg-muted">
          {weekLabel && <span>{weekLabel} · </span>}
          {totalMatches} match{totalMatches > 1 ? "s" : ""} analysé
          {totalMatches > 1 ? "s" : ""} par ZoneStat
        </p>
      </header>

      {/* TABS */}
      <SportsTabs value={sportTab} onChange={setSportTab} />

      {/* SEARCH */}
      <section>
        <label className="text-xs font-medium text-fg-muted">
          Recherche rapide
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-subtle" />
          <input
            className="w-full bg-white border border-line rounded-full pl-10 pr-3 py-2 text-sm placeholder:text-fg-subtle focus:ring-2 focus:ring-[var(--color-primary)]/30"
            placeholder="PSG, Marseille, Lens..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </section>

      {/* BLOCS PAR JOUR (style Betclic) */}
      <section className="space-y-3">
        {groupedByDate.map((group) => (
          <div
            key={group.dateKey}
            className="rounded-3xl bg-white border border-line shadow-[0_12px_30px_rgba(15,23,42,0.06)] overflow-hidden"
          >
            {/* Bandeau jour */}
            <div className="px-4 py-2.5 sm:px-5 bg-slate-50 border-b border-line flex items-center justify-between">
              <span className="text-sm font-semibold">
                {group.dateLabel}
              </span>
              <span className="text-[11px] text-fg-subtle">
                {group.matches.length} match
                {group.matches.length > 1 ? "s" : ""} de Ligue 1
              </span>
            </div>

            {/* Liste des matchs du jour */}
            <div className="divide-y divide-slate-100">
              {group.matches.map((m) => {
                const ai = aiInsights[m.id];

                return (
                  <Link
                    key={m.id}
                    href={`/match/${m.id}`}
                    className="block px-4 py-3 sm:px-5 sm:py-3.5 active:bg-slate-50/80"
                  >
                    <div className="flex items-center justify-between gap-3">
                      {/* Heure + ligue */}
                      <div className="flex items-center gap-3 min-w-[90px]">
                        <span className="text-sm font-semibold flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-fg-subtle" />
                          {m.hour}
                        </span>
                      </div>

                      {/* Duel équipes */}
                      <div className="flex-1 flex items-center justify-center gap-3 sm:gap-4 text-sm font-medium text-center sm:text-left">
                        <div className="flex items-center gap-2 min-w-0">
                          {m.homeLogo && (
                            <img
                              src={m.homeLogo}
                              alt={m.home}
                              className="h-6 w-6 object-contain"
                            />
                          )}
                          <span className="truncate">{m.home}</span>
                        </div>

                        <span className="text-[10px] uppercase text-fg-subtle">
                          vs
                        </span>

                        <div className="flex items-center gap-2 min-w-0">
                          {m.awayLogo && (
                            <img
                              src={m.awayLogo}
                              alt={m.away}
                              className="h-6 w-6 object-contain"
                            />
                          )}
                          <span className="truncate">{m.away}</span>
                        </div>
                      </div>

                      {/* Bouton / tag à droite */}
                      <div className="hidden sm:flex">
                        <span className="text-[11px] px-3 py-1 rounded-full bg-slate-900 text-white font-medium">
                          Voir la fiche
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        <div ref={loadMoreRef} className="h-10"></div>
      </section>
    </div>
  );
}
