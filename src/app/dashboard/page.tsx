// src/app/dashboard/page.tsx

import DashboardClient from "./DashboardClient";
import { serverClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

type DailyDashboardRow = {
  date: string;
  data: {
    matches?: any[];
  };
};

export default async function DashboardPage() {
  const supabase = await serverClient();

  const today = new Date();

  // début = aujourd'hui
  const startDate = today.toISOString().slice(0, 10);

  // fin = aujourd'hui + 6 jours (7 jours au total)
  const endDateObj = new Date(today);
  endDateObj.setDate(endDateObj.getDate() + 13);
  const endDate = endDateObj.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("daily_dashboards")
    .select("date,data")
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date", { ascending: true });

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

  const rows = (data as DailyDashboardRow[] | null) ?? [];

  if (!rows.length) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <section className="card p-8 space-y-4 text-center">
          <h1 className="text-2xl font-semibold text-fg">
            Aucun dashboard généré sur les 7 prochains jours
          </h1>
          <p className="text-sm text-fg-muted">
            Vérifie que le cron{" "}
            <code className="px-1 py-0.5 rounded bg-bg-soft border border-line text-[11px]">
              /api/cron/generate-dashboard
            </code>{" "}
            est bien lancé pour chaque jour, et que la table{" "}
            <span className="font-mono">daily_dashboards</span> contient des
            données.
          </p>
        </section>
      </div>
    );
  }

  const days = rows.map((row) => ({
    date: row.date,
    matches: row.data?.matches ?? [],
  }));

  return (
    <div className="space-y-10">
      <DashboardClient days={days} />
    </div>
  );
}
