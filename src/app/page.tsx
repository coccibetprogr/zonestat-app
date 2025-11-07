// src/app/page.tsx
import Link from "next/link";

export default function Home() {
  return (
    <div className="space-y-12">
      {/* HERO */}
      <section className="fade-in-up">
        <div className="text-center max-w-2xl mx-auto">
          <h1 className="text-4xl sm:text-5xl font-semibold leading-tight tracking-tight">
            Le match avant le match.
          </h1>
          <p className="mt-4 text-fg-muted text-base sm:text-lg">
            ZoneStat t’aide à <strong>analyser</strong>, <strong>comparer</strong> et <strong>anticiper</strong> avant le coup d’envoi.
            Un tableau de bord clair, des stats utiles, et une expérience rapide.
          </p>

          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/signup" className="btn btn-primary w-full sm:w-auto">
              Créer un compte
            </Link>
            <Link href="/login" className="btn btn-ghost w-full sm:w-auto">
              Se connecter
            </Link>
          </div>

          {/* Petite preuve/accroche */}
          <p className="mt-3 text-xs text-fg-subtle">
            Pas encore prêt ? Jette un œil au <Link href="/dashboard" className="underline">dashboard démo</Link>.
          </p>
        </div>
      </section>

      {/* AVANTAGES / FEATURES */}
      <section className="fade-in-up">
        <div className="grid gap-4 sm:gap-6 sm:grid-cols-2">
          <div className="card card-hover p-5">
            <div className="flex items-start gap-3">
              <div className="text-2xl">⚡</div>
              <div>
                <h3 className="text-base font-semibold">Vue claire & rapide</h3>
                <p className="text-sm text-fg-subtle mt-1">
                  Un design épuré et des composants optimisés pour aller droit au but.
                </p>
              </div>
            </div>
          </div>

          <div className="card card-hover p-5">
            <div className="flex items-start gap-3">
              <div className="text-2xl">📊</div>
              <div>
                <h3 className="text-base font-semibold">Stats utiles</h3>
                <p className="text-sm text-fg-subtle mt-1">
                  Des informations actionnables, mises en forme pour décider rapidement.
                </p>
              </div>
            </div>
          </div>

          <div className="card card-hover p-5">
            <div className="flex items-start gap-3">
              <div className="text-2xl">🛡️</div>
              <div>
                <h3 className="text-base font-semibold">Sécurité intégrée</h3>
                <p className="text-sm text-fg-subtle mt-1">
                  Auth Supabase, anti-bot Cloudflare et protections contre les abus intégrées.
                </p>
              </div>
            </div>
          </div>

          <div className="card card-hover p-5">
            <div className="flex items-start gap-3">
              <div className="text-2xl">🚀</div>
              <div>
                <h3 className="text-base font-semibold">Évolutif</h3>
                <p className="text-sm text-fg-subtle mt-1">
                  Prêt pour brancher des flux live, des offres Stripe et des modules avancés.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA BAS DE PAGE */}
      <section className="fade-in-up">
        <div className="card card-hover p-6 sm:p-8 text-center">
          <h3 className="text-xl font-semibold">Commencer gratuitement</h3>
          <p className="text-sm text-fg-subtle mt-2">
            Crée ton compte en 30 secondes et retrouve toutes tes infos au même endroit.
          </p>
          <div className="mt-5 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/signup" className="btn btn-primary w-full sm:w-auto">
              S’inscrire
            </Link>
            <Link href="/login" className="btn btn-ghost w-full sm:w-auto">
              J’ai déjà un compte
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
