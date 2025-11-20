"use client";

export function MatchH2H({ match }: { match: any }) {
  return (
    <section className="card p-6 space-y-4 fade-in-up">
      <h2 className="text-xl font-semibold">Confrontations directes (H2H)</h2>

      {!match.h2h || match.h2h.results.length === 0 ? (
        <p className="text-fg-muted">Aucune confrontation récente.</p>
      ) : (
        <div className="space-y-3 text-sm">
          {match.h2h.results.map((r: any, i: number) => (
            <div key={i} className="flex justify-between">
              <span>{r.date}</span>
              <span>{r.score}</span>
              <span>xG: {r.xg_home} - {r.xg_away}</span>
            </div>
          ))}

          <div className="pt-4 border-t border-border">
            <p>Tendance BTTS : {match.h2h.tendances.btts}%</p>
            <p>Tendance Over 2.5 : {match.h2h.tendances.over25}%</p>
          </div>
        </div>
      )}
    </section>
  );
}
