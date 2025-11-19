"use client";

export default function FakeDashboard() {
  return (
    <div className="relative rounded-2xl border border-line bg-bg-soft/60 backdrop-blur-xl p-6 shadow-xl w-full max-w-4xl mx-auto fade-in-up">

      {/* HEADER */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold">Aperçu du tableau de bord</h3>
          <p className="text-sm text-fg-subtle">Aperçu visuel du style ZoneStat</p>
        </div>

        {/* Live Sync → couleur bleue au lieu du vert */}
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-[var(--color-primary)]" />
          <span className="text-xs text-fg-muted">Live Sync</span>
        </div>
      </div>

      {/* GRID CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl border border-line bg-bg-soft p-4">
          <p className="text-xs text-fg-muted mb-1">Matchs du jour</p>
          <p className="text-2xl font-bold">18</p>
        </div>
        <div className="rounded-xl border border-line bg-bg-soft p-4">
          <p className="text-xs text-fg-muted mb-1">Forme moyenne</p>
          <p className="text-2xl font-bold">68%</p>
        </div>
        <div className="rounded-xl border border-line bg-bg-soft p-4">
          <p className="text-xs text-fg-muted mb-1">Matchs “tendances”</p>
          <p className="text-2xl font-bold">7</p>
        </div>
      </div>

      {/* MINI TABLE */}
      <div className="rounded-xl border border-line bg-bg-soft overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg-muted/40">
            <tr className="text-left text-xs text-fg-subtle uppercase tracking-wider">
              <th className="p-3">Match</th>
              <th className="p-3">Dynamique</th>
              <th className="p-3">Forme</th>
              <th className="p-3">Ressenti</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 4 }).map((_, i) => (
              <tr key={i} className="border-t border-line/50">
                <td className="p-3 font-medium">Équipe A vs Équipe B</td>
                <td className="p-3">
                  <div className="h-1.5 bg-fg-muted/20 rounded-full overflow-hidden">
                    {/* barre bleue au lieu de la barre verte */}
                    <div className="h-full bg-[var(--color-primary)] w-1/2" />
                  </div>
                </td>

                <td className="p-3">⚽ 3 / 5</td>

                {/* texte bleu au lieu du vert */}
                <td className="p-3 text-[var(--color-primary)] font-medium">
                  👍 Léger avantage
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
