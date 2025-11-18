"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Search,
  Filter,
  Clock,
  Star,
  Lock,
  Unlock,
  Sparkles,
  ChevronDown,
  PencilLine,
} from "lucide-react";

type Importance = "high" | "medium" | "low";
type PredictionOutcome = "none" | "home" | "draw" | "away";

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
}

interface DashboardClientProps {
  date: string; // ex: "2025-11-18"
  matches: RawMatch[]; // daily_dashboards.data.matches
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
  const [predictions, setPredictions] = useState<
    Record<string, UserPrediction>
  >({});
  const [aiInsights, setAiInsights] = useState<Record<string, AiInsight>>({});
  const [visibleCount, setVisibleCount] = useState<number>(20);
  const [now, setNow] = useState<number>(() => Date.now()); // ms

  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // 🕒 met à jour "now" toutes les 60s pour que les matchs basculent automatiquement
  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  // Normalisation des matchs + filtre "match non démarré"
  const items: EnrichedMatch[] = useMemo(
    () =>
      matches
        .map((raw: RawMatch) => normalize(raw))
        .filter((m) => {
          // si on n'a pas de timestamp, on garde par défaut
          if (!m.timestamp || Number.isNaN(m.timestamp)) return true;
          // fixture.timestamp = secondes depuis epoch (UTC)
          const kickOffMs = m.timestamp * 1000;
          return kickOffMs > now; // on ne garde que les matchs à venir
        })
        .sort((a, b) => a.timestamp - b.timestamp),
    [matches, now]
  );

  // Filtrage global (recherche + importance)
  const filteredMatches: EnrichedMatch[] = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();

    return items.filter((m) => {
      if (importance !== "all" && m.importance !== importance) {
        return false;
      }

      if (!searchTerm) return true;

      return (
        m.home.toLowerCase().includes(searchTerm) ||
        m.away.toLowerCase().includes(searchTerm) ||
        m.league.toLowerCase().includes(searchTerm)
      );
    });
  }, [items, importance, search]);

  // Reset du scroll infini quand les filtres changent
  useEffect(() => {
    setVisibleCount(20);
  }, [importance, search, date]);

  // Scroll infini : +20 à chaque fois que le sentinel est vu
  useEffect(() => {
    if (!loadMoreRef.current) return;
    if (visibleCount >= filteredMatches.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) =>
            prev + 20 > filteredMatches.length
              ? filteredMatches.length
              : prev + 20
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

  const favoriteCount = useMemo(
    () =>
      Object.values(predictions).filter((p) => p.favorite).length,
    [predictions]
  );

  const highImportanceCount = useMemo(
    () => items.filter((m) => m.importance === "high").length,
    [items]
  );

  const updatePrediction = (
    matchId: string,
    partial: Partial<UserPrediction>
  ) => {
    setPredictions((prev) => {
      const current = prev[matchId] ?? defaultPrediction;

      // si locked, on ne touche pas au outcome
      if (
        current.locked &&
        partial.outcome &&
        partial.outcome !== current.outcome
      ) {
        return prev;
      }

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

  // Heuristiques UI : risk + goals profile pour affichage (en attendant l'IA)
  function getRiskLabel(importance: Importance): string {
    if (importance === "high") return "Élevé";
    if (importance === "medium") return "Modéré";
    return "Bas";
  }

  function getRiskColorClasses(importance: Importance): string {
    if (importance === "high")
      return "bg-rose-50 text-rose-700 border-rose-200";
    if (importance === "medium")
      return "bg-amber-50 text-amber-700 border-amber-200";
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }

  function getGoalsProfile(m: EnrichedMatch): string {
    const lname = m.league.toLowerCase();
    if (
      lname.includes("premier league") ||
      lname.includes("bundesliga") ||
      lname.includes("eredivisie")
    ) {
      return "Plutôt +2,5 buts";
    }
    if (
      lname.includes("ligue 1") ||
      lname.includes("serie a") ||
      lname.includes("la liga")
    ) {
      return "Match équilibré";
    }
    return "Profil neutre";
  }

  async function loadAiInsight(match: EnrichedMatch) {
    const matchId = match.id;

    setAiInsights((prev) => ({
      ...prev,
      [matchId]: {
        ...(prev[matchId] ?? {}),
        loading: true,
        error: undefined,
      },
    }));

    try {
      // 🔌 Stub provisoire — à remplacer par ton vrai fetch('/api/...') plus tard
      await new Promise((res) => setTimeout(res, 700));

      const fakeSummary = [
        `${match.home} affiche une dynamique intéressante, avec une bonne présence offensive à domicile.`,
        `${match.away} reste dangereux en transition et peut exploiter les espaces laissés.`,
        `Match qui peut offrir un bon rythme, surtout en seconde période.`,
      ].join(" ");

      const fakeInsight: AiInsight = {
        loading: false,
        summary: fakeSummary,
        goalsProfile: getGoalsProfile(match),
        riskLevel: getRiskLabel(match.importance),
        confidence:
          match.importance === "high"
            ? "Confiance : moyenne +"
            : "Confiance : prudente",
        suggestedScore:
          match.importance === "high"
            ? "Score potentiel : 2–1"
            : "Score potentiel : 1–1",
      };

      setAiInsights((prev) => ({
        ...prev,
        [matchId]: fakeInsight,
      }));
    } catch (err: any) {
      setAiInsights((prev) => ({
        ...prev,
        [matchId]: {
          ...(prev[matchId] ?? {}),
          loading: false,
          error: "Impossible de récupérer l’analyse pour le moment.",
        },
      }));
    }
  }

  const visibleMatches = filteredMatches.slice(0, visibleCount);

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-10">
      {/* HEADER PREMIUM */}
      <header className="space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-line bg-bg-soft px-4 py-1.5 text-xs uppercase tracking-widest">
          <div className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]" />
          <span>Dashboard du jour</span>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-fg">
              Matchs du {readableDate}
            </h1>
            <p className="text-sm text-fg-muted">
              {totalMatches} match
              {totalMatches > 1 ? "s" : ""} à venir analysé
              {totalMatches > 1 ? "s" : ""} par le moteur ZoneStat.
            </p>
          </div>

          {/* Stat bar Apple-like */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-2xl border border-line bg-bg-soft px-3 py-2 text-center">
              <p className="text-[10px] uppercase tracking-wide text-fg-subtle">
                Gros matchs
              </p>
              <p className="mt-1 text-sm font-semibold text-fg">
                {highImportanceCount}
              </p>
            </div>
            <div className="rounded-2xl border border-line bg-bg-soft px-3 py-2 text-center">
              <p className="text-[10px] uppercase tracking-wide text-fg-subtle">
                Pronos posés
              </p>
              <p className="mt-1 text-sm font-semibold text-fg">
                {predictedCount}
              </p>
            </div>
            <div className="rounded-2xl border border-line bg-bg-soft px-3 py-2 text-center">
              <p className="text-[10px] uppercase tracking-wide text-fg-subtle">
                Favoris
              </p>
              <p className="mt-1 text-sm font-semibold text-fg">
                {favoriteCount}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* FILTRES PREMIUM */}
      <section className="space-y-3">
        <div className="grid sm:grid-cols-[2fr,1.2fr] gap-4">
          {/* Recherche */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-fg-muted">
              Recherche rapide
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle h-4 w-4" />
              <input
                className="w-full bg-white border border-line rounded-full pl-10 pr-3 py-2 text-sm text-fg placeholder:text-fg-subtle shadow-[0_0_0_1px_rgba(15,23,42,0.02)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)]"
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
              Filtrer par importance
            </label>
            <div className="flex flex-wrap gap-2 text-xs">
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
                  className={`px-3 py-1 rounded-full border transition text-xs ${
                    importance === btn.key
                      ? "border-[var(--color-primary)] text-[var(--color-primary)] bg-[var(--color-primary)]/5"
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

        {/* Info sur le nombre visible */}
        {filteredMatches.length > 0 && (
          <p className="text-[11px] text-fg-subtle">
            Affichage de{" "}
            <span className="font-medium text-fg">
              {visibleMatches.length}
            </span>{" "}
            sur{" "}
            <span className="font-medium text-fg">
              {filteredMatches.length}
            </span>{" "}
            matchs à venir.
          </p>
        )}
      </section>

      {/* LISTE MATCHS + SCROLL INFINI */}
      <section className="space-y-3">
        {filteredMatches.length === 0 && (
          <div className="text-center text-fg-muted py-10 border border-dashed border-line rounded-2xl bg-bg-soft text-sm">
            Aucun match à venir ne correspond aux filtres.  
            Essaie d&apos;élargir la recherche ou de modifier l&apos;importance.
          </div>
        )}

        {visibleMatches.map((m) => {
          const prediction = predictions[m.id] ?? defaultPrediction;
          const ai = aiInsights[m.id];
          const hasAi = !!ai?.summary && !ai.loading;

          const isLocked = prediction.locked;
          const isFavorite = prediction.favorite;

          return (
            <article
              key={m.id}
              className="rounded-3xl border border-line bg-white px-4 py-3 sm:px-5 sm:py-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] transition hover:shadow-[0_16px_40px_rgba(15,23,42,0.06)]"
            >
              {/* Ligne principale */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                {/* Heure + ligue */}
                <div className="flex items-center gap-3 text-xs text-fg-muted w-full sm:w-44">
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-fg flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {m.hour}
                    </span>
                    <span className="text-[11px] text-fg-subtle mt-0.5">
                      {m.league}
                      {m.country ? ` · ${m.country}` : ""}
                    </span>
                  </div>
                </div>

                {/* Équipes */}
                <div className="flex-1 text-sm font-medium text-fg text-center sm:text-left">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-center gap-1">
                    <span className="truncate">{m.home}</span>
                    <span className="text-[10px] uppercase tracking-[0.15em] text-fg-subtle">
                      vs
                    </span>
                    <span className="truncate">{m.away}</span>
                  </div>

                  <div className="mt-1 flex flex-wrap items-center justify-center sm:justify-start gap-1.5 text-[10px]">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${getRiskColorClasses(
                        m.importance
                      )}`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                      Risque {getRiskLabel(m.importance)}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 bg-bg-soft text-fg-subtle">
                      {getGoalsProfile(m)}
                    </span>
                    {m.venue && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 bg-white text-fg-subtle">
                        {m.venue}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions rapides (favori + lock) */}
                <div className="flex items-center justify-end gap-2 text-xs w-full sm:w-32">
                  <button
                    type="button"
                    className={`inline-flex items-center justify-center rounded-full border px-2 py-1 transition ${
                      isFavorite
                        ? "border-yellow-400 bg-yellow-50 text-yellow-700"
                        : "border-line bg-bg-soft text-fg-subtle hover:bg-white"
                    }`}
                    onClick={() =>
                      updatePrediction(m.id, {
                        favorite: !prediction.favorite,
                      })
                    }
                  >
                    <Star
                      className={`h-3.5 w-3.5 ${
                        isFavorite ? "fill-yellow-400" : "fill-none"
                      }`}
                    />
                  </button>

                  <button
                    type="button"
                    className={`inline-flex items-center justify-center rounded-full border px-2 py-1 transition ${
                      isLocked
                        ? "border-slate-800 bg-slate-900 text-white"
                        : "border-line bg-bg-soft text-fg-subtle hover:bg-white"
                    }`}
                    onClick={() =>
                      updatePrediction(m.id, {
                        locked: !prediction.locked,
                      })
                    }
                  >
                    {isLocked ? (
                      <Lock className="h-3.5 w-3.5" />
                    ) : (
                      <Unlock className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Zone PRONO + IA */}
              <div className="mt-3 border-t border-line pt-3 space-y-3">
                {/* Ligne prono */}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[11px] font-medium text-fg-muted flex items-center gap-1">
                    <span>Prono rapide</span>
                    {prediction.outcome !== "none" && (
                      <span className="text-fg-subtle">
                        ({outcomeLabel[prediction.outcome]}
                        {prediction.locked ? " · verrouillé" : ""})
                      </span>
                    )}
                  </p>

                  <div className="flex flex-wrap gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() =>
                        updatePrediction(m.id, { outcome: "home" })
                      }
                      className={`px-3 py-1 rounded-full border transition ${
                        prediction.outcome === "home"
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                          : "border-line bg-white text-fg-muted hover:bg-bg-soft"
                      }`}
                    >
                      Domicile
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updatePrediction(m.id, { outcome: "draw" })
                      }
                      className={`px-3 py-1 rounded-full border transition ${
                        prediction.outcome === "draw"
                          ? "border-sky-500 bg-sky-50 text-sky-700"
                          : "border-line bg-white text-fg-muted hover:bg-bg-soft"
                      }`}
                    >
                      Nul
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updatePrediction(m.id, { outcome: "away" })
                      }
                      className={`px-3 py-1 rounded-full border transition ${
                        prediction.outcome === "away"
                          ? "border-orange-500 bg-orange-50 text-orange-700"
                          : "border-line bg-white text-fg-muted hover:bg-bg-soft"
                      }`}
                    >
                      Extérieur
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updatePrediction(m.id, { outcome: "none" })
                      }
                      className="px-3 py-1 rounded-full border border-line bg-bg-soft text-fg-subtle hover:bg-white"
                    >
                      Réinitialiser
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updatePrediction(m.id, {
                          noteOpen: !prediction.noteOpen,
                        })
                      }
                      className="px-3 py-1 rounded-full border border-line bg-white text-fg-muted hover:bg-bg-soft inline-flex items-center gap-1"
                    >
                      <PencilLine className="h-3 w-3" />
                      Note
                    </button>
                  </div>
                </div>

                {/* Note perso */}
                {prediction.noteOpen && (
                  <div className="pt-1">
                    <textarea
                      rows={2}
                      placeholder="Tes raisons, contexte, stats clés..."
                      className="w-full rounded-2xl border border-line bg-bg-soft px-3 py-2 text-xs text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
                      value={prediction.note}
                      onChange={(e) =>
                        updatePrediction(m.id, {
                          note: e.target.value,
                        })
                      }
                    />
                  </div>
                )}

                {/* Bloc IA / insights */}
                <div className="border border-dashed border-line rounded-2xl bg-bg-soft px-3 py-2 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-[var(--color-primary)]" />
                      <p className="text-[11px] font-medium text-fg-muted">
                        Insights IA (bientôt ZoneStat Pro)
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => loadAiInsight(m)}
                      className="text-[11px] rounded-full border border-line bg-white px-3 py-1 text-fg-muted hover:bg-bg-soft inline-flex items-center gap-1"
                      disabled={ai?.loading}
                    >
                      {ai?.loading ? (
                        <>Analyse en cours…</>
                      ) : (
                        <>Générer une analyse</>
                      )}
                    </button>
                  </div>

                  {ai?.error && (
                    <p className="text-[11px] text-rose-600">
                      {ai.error}
                    </p>
                  )}

                  {hasAi && (
                    <details className="group rounded-xl border border-line bg-white px-3 py-2 text-[11px] text-fg-subtle">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
                        <span className="font-medium text-fg">
                          Analyse synthétique du match
                        </span>
                        <span className="inline-flex items-center gap-1 text-[10px] text-fg-subtle">
                          Détail
                          <ChevronDown className="h-3 w-3 transition group-open:rotate-180" />
                        </span>
                      </summary>
                      <div className="mt-2 space-y-1">
                        {ai.goalsProfile && (
                          <p className="text-[11px]">
                            <span className="font-semibold">
                              Profil buts :{" "}
                            </span>
                            {ai.goalsProfile}
                          </p>
                        )}
                        {ai.riskLevel && (
                          <p className="text-[11px]">
                            <span className="font-semibold">
                              Risque global :{" "}
                            </span>
                            {ai.riskLevel}
                          </p>
                        )}
                        {ai.suggestedScore && (
                          <p className="text-[11px]">
                            <span className="font-semibold">
                              Score potentiel :{" "}
                            </span>
                            {ai.suggestedScore}
                          </p>
                        )}
                        {ai.confidence && (
                          <p className="text-[11px]">{ai.confidence}</p>
                        )}
                        {ai.summary && (
                          <p className="text-[11px] leading-snug mt-1 whitespace-pre-line">
                            {ai.summary}
                          </p>
                        )}
                      </div>
                    </details>
                  )}
                </div>
              </div>
            </article>
          );
        })}

        {/* Sentinel pour le scroll infini */}
        {filteredMatches.length > visibleMatches.length && (
          <div
            ref={loadMoreRef}
            className="h-10 flex items-center justify-center text-[11px] text-fg-subtle"
          >
            Chargement de matchs supplémentaires…
          </div>
        )}
      </section>
    </div>
  );
}
