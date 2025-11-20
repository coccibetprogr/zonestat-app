"use client";

export function MatchForm({ match }: { match: any }) {
  return (
    <section className="card p-6 space-y-4 fade-in-up">
      <h2 className="text-xl font-semibold">Forme récente</h2>

      {!match.form ? (
        <p className="text-fg-muted">Forme indisponible.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="font-semibold">{match.homeTeam}</p>
            <p>5 derniers matchs : {match.form.home_last5.join(" ")}</p>
            <p>Buts marqués : {match.form.home_goals_scored}</p>
            <p>Buts encaissés : {match.form.home_goals_conceded}</p>
          </div>

          <div>
            <p className="font-semibold">{match.awayTeam}</p>
            <p>5 derniers matchs : {match.form.away_last5.join(" ")}</p>
            <p>Buts marqués : {match.form.away_goals_scored}</p>
            <p>Buts encaissés : {match.form.away_goals_conceded}</p>
          </div>
        </div>
      )}
    </section>
  );
}
