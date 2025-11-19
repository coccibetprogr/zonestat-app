import type { SportTabId } from "./sports-tabs";

interface SidebarFiltersProps {
  sport: SportTabId;
}

export function SidebarFilters({ sport }: SidebarFiltersProps) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm h-fit">
      <h2 className="font-semibold mb-3 text-lg">Filtres</h2>

      {sport === "football" && (
        <div className="space-y-2">
          <p className="font-medium text-sm text-slate-600">Compétitions foot</p>
          <ul className="space-y-1 text-sm">
            <li>Ligue 1</li>
            <li>Premier League</li>
            <li>Ligue des Champions</li>
            <li>Europa League</li>
          </ul>
        </div>
      )}

      {sport === "tennis" && (
        <div className="space-y-2">
          <p className="font-medium text-sm text-slate-600">Compétitions tennis</p>
          <ul className="space-y-1 text-sm">
            <li>ATP Tour</li>
            <li>Challenger</li>
            <li>Grand Chelem</li>
            <li>Coupe Davis</li>
          </ul>
        </div>
      )}

      {sport === "for-you" && (
        <p className="text-sm text-slate-500">
          Sélection personnalisée de matchs (foot + tennis).
        </p>
      )}
    </div>
  );
}
