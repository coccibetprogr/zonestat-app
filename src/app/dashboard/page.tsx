// src/app/dashboard/page.tsx

import DashboardClient from "./DashboardClient";
import { serverClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await serverClient();

  const today = new Date();
  const isoDate = today.toISOString().slice(0, 10); // ex: "2025-11-18"

  const { data, error } = await supabase
    .from("daily_dashboards")
    .select("date,data")
    .eq("date", isoDate)
    .maybeSingle();

  if (error) {
    console.error("[dashboard] Supabase error", error);
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="card p-6 space-y-3 text-center">
          <h1 className="text-xl font-semibold text-fg">
            Impossible de charger le dashboard
          </h1>
          <p className="text-sm text-fg-muted">
            Une erreur est survenue lors de la récupération des données.
            Réessaie dans quelques instants.
          </p>
        </div>
      </div>
    );
  }

  if (!data?.data?.matches || !Array.isArray(data.data.matches)) {
    // Pas de dashboard pour aujourd'hui → empty state dans le même style que la home
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <section className="card p-8 space-y-4 text-center">
          <h1 className="text-2xl font-semibold text-fg">
            Aucun dashboard généré pour aujourd&apos;hui
          </h1>
          <p className="text-sm text-fg-muted">
            Lance le cron{" "}
            <code className="px-1 py-0.5 rounded bg-bg-soft border border-line text-[11px]">
              /api/cron/generate-dashboard
            </code>{" "}
            ou vérifie que la ligne existe dans{" "}
            <span className="font-mono">daily_dashboards</span>.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* même logique que ta home : juste un wrapper, pas de bg sombre ici */}
      <DashboardClient
        date={data.date ?? isoDate}
        matches={data.data.matches}
      />
    </div>
  );
}
