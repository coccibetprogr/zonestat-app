"use client";

export function MatchStats({ match }: { match: any }) {
  return (
    <section className="card p-6 space-y-4 fade-in-up">
      <h2 className="text-xl font-semibold">Statistiques clés</h2>

      {!match.stats ? (
        <p className="text-fg-muted">Aucune statistique disponible.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p>xG domicile : {match.stats.xg_home}</p>
            <p>Tirs : {match.stats.shots_home}</p>
            <p>Tirs cadrés : {match.stats.shots_on_target_home}</p>
          </div>
          <div>
            <p>xG extérieur : {match.stats.xg_away}</p>
            <p>Tirs : {match.stats.shots_away}</p>
            <p>Tirs cadrés : {match.stats.shots_on_target_away}</p>
          </div>
        </div>
      )}
    </section>
  );
}
