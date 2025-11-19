import type { SportTabId } from "./sports-tabs";
import { MatchCard, type Match } from "./match-card";

interface MatchesFeedProps {
  sport: SportTabId;
}

const MOCK_MATCHES: Match[] = [
  {
    id: 1,
    sport: "football",
    competition: "Ligue 1",
    home: "Paris SG",
    away: "Le Havre",
    odds: { home: "1.13", away: "14.00" },
  },
  {
    id: 2,
    sport: "tennis",
    competition: "Coupe Davis",
    home: "M. Berrettini",
    away: "J. Rodionov",
    odds: { home: "1.15", away: "4.00" },
  },
];

export function MatchesFeed({ sport }: MatchesFeedProps) {
  const matchesToShow =
    sport === "for-you"
      ? MOCK_MATCHES
      : MOCK_MATCHES.filter((m) => m.sport === sport);

  return (
    <div className="space-y-4">
      {matchesToShow.map((match) => (
        <MatchCard key={match.id} match={match} />
      ))}
    </div>
  );
}
