import type { SportTabId } from "./sports-tabs";

export interface Match {
  id: number;
  sport: Exclude<SportTabId, "for-you">; // "football" ou "tennis"
  competition: string;
  home: string;
  away: string;
  odds: {
    home: string;
    away: string;
    draw?: string;
  };
}

interface MatchCardProps {
  match: Match;
}

export function MatchCard({ match }: MatchCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-slate-200">
      <div className="w-full h-36 bg-slate-100 flex items-center justify-center">
        <p className="text-slate-500 text-sm">Image match</p>
      </div>

      <div className="p-4">
        <p className="text-sm text-slate-500">{match.competition}</p>
        <p className="font-semibold text-lg mt-1">
          {match.home} - {match.away}
        </p>

        <div className="grid grid-cols-2 gap-2 mt-4">
          <div className="p-2 border rounded-lg text-center">
            <p className="text-xs text-slate-500">{match.home}</p>
            <p className="font-bold text-base">{match.odds.home}</p>
          </div>
          <div className="p-2 border rounded-lg text-center">
            <p className="text-xs text-slate-500">{match.away}</p>
            <p className="font-bold text-base">{match.odds.away}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
