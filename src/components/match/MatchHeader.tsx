"use client";

export function MatchHeader({ match }: { match: any }) {
  return (
    <section className="card p-6 fade-in-up">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={match.homeLogo} className="w-12 h-12 rounded-md" />
          <span className="text-xl font-semibold">{match.homeTeam}</span>
        </div>

        <span className="text-lg font-medium">VS</span>

        <div className="flex items-center gap-3">
          <span className="text-xl font-semibold">{match.awayTeam}</span>
          <img src={match.awayLogo} className="w-12 h-12 rounded-md" />
        </div>
      </div>

      <p className="text-fg-muted text-sm mt-4">
        {match.league} •{" "}
        {new Date(match.kickoff).toLocaleString("fr-FR")}
      </p>

      <p className="mt-3 text-sm italic">{match.note}</p>
    </section>
  );
}
