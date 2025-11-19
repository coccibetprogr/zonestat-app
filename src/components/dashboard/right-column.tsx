import type { SportTabId } from "./sports-tabs";

interface RightColumnProps {
  sport: SportTabId;
}

export function RightColumn({ sport }: RightColumnProps) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm h-fit">
      <h2 className="font-semibold text-lg mb-3">Pour toi</h2>
      <p className="text-slate-500 text-sm mb-2">
        Bientôt : suggestions de matchs et analyses personnalisées.
      </p>
      <p className="text-xs text-slate-400">
        Sport sélectionné : <span className="font-medium">{sport}</span>
      </p>
    </div>
  );
}
