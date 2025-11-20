"use client";

export function MatchIA({ match }: { match: any }) {
  return (
    <section className="card p-6 space-y-3 fade-in-up">
      <h2 className="text-xl font-semibold">Prédictions IA</h2>

      {!match.predictions ? (
        <p className="text-fg-muted">Aucune donnée IA disponible.</p>
      ) : (
        <div className="space-y-1 text-sm">
          <p>Victoire domicile : {match.predictions.homeWinProb}%</p>
          <p>Nul : {match.predictions.drawProb}%</p>
          <p>Victoire extérieur : {match.predictions.awayWinProb}%</p>
          <p>Score probable : {match.predictions.scoreProbable}</p>
          <p>Confiance IA : {match.predictions.confiance}</p>
        </div>
      )}
    </section>
  );
}
