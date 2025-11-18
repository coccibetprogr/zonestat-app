// src/app/dashboard/page.tsx
import { serverClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type ProfileRow = {
  stripe_subscription_status: string | null;
  free_until: string | null;
};

type MatchInsight = {
  id: string;
  league: string;
  kickoff: string;
  homeTeam: string;
  awayTeam: string;
  tags: string[];
  note: string;
  riskLevel: "low" | "medium" | "high";
  over15Prob: number;
  over25Prob: number;
  bttsProb: number;
};

type DashboardPayload = {
  matches: MatchInsight[];
};

export default async function DashboardPage() {
  const supabase = await serverClient();

  // 1) Récup user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/dashboard");
  }

  // 2) Récup profil pour connaître le statut Stripe + essai gratuit
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("stripe_subscription_status, free_until")
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();

  if (profileError) {
    redirect("/pricing");
  }

  const rawStatus = profile?.stripe_subscription_status ?? null;

  let hasAnySubscription =
    rawStatus !== null &&
    rawStatus !== "canceled" &&
    rawStatus !== "incomplete_expired";

  const now = new Date();
  const freeUntilRaw = profile?.free_until ?? null;
  const freeUntilDate =
    freeUntilRaw != null ? new Date(freeUntilRaw as string) : null;

  const isFreeTrial =
    freeUntilDate !== null &&
    !Number.isNaN(freeUntilDate.getTime()) &&
    freeUntilDate > now;

  if (!hasAnySubscription && !isFreeTrial) {
    redirect("/pricing");
  }

  // 3) Lecture du dashboard du jour depuis Supabase (CACHE)
  const todayStr = new Date().toISOString().slice(0, 10);

  const { data: dashRow, error: dashError } = await supabase
    .from("daily_dashboards")
    .select("data, generated_at")
    .eq("date", todayStr)
    .maybeSingle<{ data: DashboardPayload; generated_at: string }>();

  if (dashError) {
    console.error("[dashboard] error reading daily_dashboards", dashError);
  }

  const matches = dashRow?.data?.matches ?? [];

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-white/70 text-sm">
          Bienvenue sur ton espace ZoneStat. Ton accès est actif
          {isFreeTrial ? " (essai gratuit en cours)." : " (abonnement en cours)."}
        </p>
        {dashRow && (
          <p className="text-[11px] text-fg-subtle">
            Données générées le{" "}
            {new Date(dashRow.generated_at).toLocaleString("fr-FR", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        )}
      </header>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">
          Les matchs à vraiment surveiller aujourd’hui
        </h2>

        {!dashRow && (
          <p className="text-xs text-fg-subtle">
            Les données du jour ne sont pas encore disponibles. Reviens un peu plus tard.
          </p>
        )}

        {dashRow && matches.length === 0 && (
          <p className="text-xs text-fg-subtle">
            Aucun match à afficher aujourd’hui avec les critères actuels.
          </p>
        )}

        {dashRow && matches.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            {matches.slice(0, 8).map((match) => (
              <article
                key={match.id}
                className="border border-line rounded-xl bg-bg-soft p-4 space-y-2"
              >
                <div className="flex items-center justify-between text-xs text-fg-subtle">
                  <span>{match.league}</span>
                  <span className="font-medium">
                    {new Date(match.kickoff).toLocaleTimeString("fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <h3 className="text-sm font-semibold">
                  {match.homeTeam} vs {match.awayTeam}
                </h3>

                <div className="flex flex-wrap gap-1 mt-1">
                  {match.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[11px] rounded-full px-2 py-[2px] bg-bg border border-line text-fg-subtle"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                <p className="text-xs text-fg-subtle mt-2 leading-relaxed">
                  {match.note}
                </p>

                <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-fg-subtle">
                  <span>Over 1,5 : {match.over15Prob}%</span>
                  <span>Over 2,5 : {match.over25Prob}%</span>
                  <span>BTTS : {match.bttsProb}%</span>
                  <span>
                    Risque :{" "}
                    {match.riskLevel === "low"
                      ? "Faible"
                      : match.riskLevel === "medium"
                      ? "Moyen"
                      : "Élevé"}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
