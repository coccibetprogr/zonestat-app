// src/app/error.tsx
"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }, reset: () => void }) {
  useEffect(() => {
    // log côté client si besoin ; côté serveur, on a déjà les logs structurés
    // console.error(error);
  }, [error]);

  return (
    <html lang="fr">
      <body className="min-h-screen bg-bg text-fg-base">
        <main className="max-w-[800px] mx-auto p-6">
          <h1 className="text-2xl font-semibold mb-2">Une erreur est survenue</h1>
          <p className="text-sm opacity-80 mb-6">
            {error?.message || "Erreur inattendue. Réessaie plus tard."}
          </p>
          <div className="flex items-center gap-3">
            <button onClick={reset} className="btn btn-primary">Réessayer</button>
            <Link href="/" className="btn btn-ghost">Retour à l’accueil</Link>
          </div>
        </main>
      </body>
    </html>
  );
}
