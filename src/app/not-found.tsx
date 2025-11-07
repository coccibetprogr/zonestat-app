// src/app/not-found.tsx
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="max-w-[800px] mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-2">Page introuvable</h1>
      <p className="text-sm opacity-80 mb-6">
        La ressource demandée n’existe pas ou a été déplacée.
      </p>
      <Link href="/" className="btn btn-primary">Retour à l’accueil</Link>
    </main>
  );
}
