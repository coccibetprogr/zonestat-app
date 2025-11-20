"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Search, Clock, Sparkles, ChevronDown } from "lucide-react";
import Link from "next/link";
import { SportsTabs, type SportTabId } from "@/components/dashboard/sports-tabs";

type Importance = "high" | "medium" | "low";
type PredictionOutcome = "none" | "home" | "draw" | "away";
type SportKind = "football" | "tennis";

// Match brut venant de daily_dashboards.data.matches
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
  homeLogo?: string;
  awayLogo?: string;
}

interface DashboardClientProps {
  date: string;
  matches: RawMatch[];
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

function normalize(raw: RawMatch): EnrichedMatch {
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
  };
}

export default function DashboardClient({ date, matches }: DashboardClientProps) {
  const [search, setSearch] = useState<string>("");
  const [importance] = useState<"all" | Importance>("all");
  const [aiInsights, setAiInsights] = useState<Record<string, AiInsight>>({});
  const [visibleCount, setVisibleCount] = useState(20);
  const [sportTab, setSportTab] = useState<SportTabId>("for-you");

  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const isCompact = false;

  const items: EnrichedMatch[] = useMemo(
    () =>
      (matches ?? [])
        .map((raw) => normalize(raw))
        .sort((a, b) => a.timestamp - b.timestamp),
    [matches]
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
    setVisibleCount(20);
  }, [importance, search, date, sportTab]);

  useEffect(() => {
    if (!loadMoreRef.current) return;
    if (visibleCount >= filteredMatches.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) =>
            prev + 20 > filteredMatches.length ? filteredMatches.length : prev + 20
          );
        }
      },
      { threshold: 1 }
    );

    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [filteredMatches.length, visibleCount]);

  const readableDate = useMemo(() => {
    const d = new Date(date);
    if (isNaN(d.getTime())) return date;
    return d.toLocaleDateString("fr-FR", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }, [date]);

  const totalMatches = items.length;

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

  const visibleMatches = filteredMatches.slice(0, visibleCount);

  return (
    <div className="max-w-6xl mx-auto px-0 sm:px-4 py-3 space-y-3">

      {/* HEADER */}
      <header className="space-y-1">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
          Matchs du {readableDate}
        </h1>
        <p className="text-sm text-fg-muted">
          {totalMatches} match{totalMatches > 1 ? "s" : ""} analysé
          {totalMatches > 1 ? "s" : ""} par ZoneStat
        </p>
      </header>

      {/* TABS */}
      <SportsTabs value={sportTab} onChange={setSportTab} />

      {/* SEARCH */}
      <section>
        <label className="text-xs font-medium text-fg-muted">Recherche rapide</label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-subtle" />
          <input
            className="w-full bg-white border border-line rounded-full pl-10 pr-3 py-2 text-sm placeholder:text-fg-subtle focus:ring-2 focus:ring-[var(--color-primary)]/30"
            placeholder="PSG, Premier League, Milan..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </section>

      {/* LISTE MATCHS */}
      <section className="space-y-1.5">
        {filteredMatches.map((m) => {
          const ai = aiInsights[m.id];

          return (
            <Link
              key={m.id}
              href={`/match/${m.id}`}
              className="block rounded-[26px] border border-line bg-white px-5 py-4 sm:px-6 sm:py-5 shadow-[0_10px_30px_rgba(15,23,42,0.06)] hover:shadow-[0_18px_45px_rgba(15,23,42,0.10)] transition"
            >
              {/* Ligne principale */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">

                <div className="flex items-center gap-3 text-xs text-fg-muted w-full sm:w-48">
                  <div>
                    <span className="text-sm font-semibold flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {m.hour}
                    </span>
                    <span className="text-[11px] text-fg-subtle mt-0.5 block">
                      {m.league}
                    </span>
                  </div>
                </div>

                <div className="flex-1 text-sm font-medium text-center sm:text-left">
                  <div className="flex items-center justify-center gap-3 sm:gap-4">
                    <div className="flex items-center gap-2">
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

                    <div className="flex items-center gap-2">
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
                </div>
              </div>

            </Link>
          );
        })}

        <div ref={loadMoreRef} className="h-10"></div>
      </section>
    </div>
  );
}
