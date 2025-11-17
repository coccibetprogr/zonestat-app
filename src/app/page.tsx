import Link from "next/link";
import { serverClient } from "@/utils/supabase/server";
import FakeDashboard from "@/components/FakeDashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isLoggedIn = !!user;

  return (
    <div className="space-y-20">

      {/* HERO */}
      <section className="pt-8 sm:pt-14 fade-in-up">
        <div className="max-w-3xl mx-auto text-center space-y-8">

          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 border border-line bg-bg-soft text-xs uppercase tracking-widest">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]" />
            <span>Analyse sportive nouvelle génération</span>
          </div>

          {/* Title */}
          <div className="space-y-4">
            <h1 className="text-4xl sm:text-5xl font-semibold leading-tight tracking-tight">
              <span className="text-fg">Découvre,</span>{" "}
              <span className="animated-words text-[var(--color-primary)] font-bold"></span>
              {" "}tes matchs autrement.
            </h1>

            <p className="text-lg text-fg-muted max-w-xl mx-auto">
              ZoneStat t’aide à lire un match comme un pro : dynamique, forme, tendances, stats utiles. 
              Une vue claire avant même le coup d’envoi.
            </p>
          </div>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            {isLoggedIn ? (
              <>
                <Link href="/dashboard" className="btn btn-primary w-full sm:w-auto">
                  Ouvrir le dashboard
                </Link>
                <Link href="/account" className="btn btn-ghost w-full sm:w-auto">
                  Mon compte
                </Link>
              </>
            ) : (
              <>
                <Link href="/signup" className="btn btn-primary w-full sm:w-auto">
                  Créer un compte gratuit
                </Link>
                <Link href="/login" className="btn btn-ghost w-full sm:w-auto">
                  J’ai déjà un compte
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Fake Dashboard */}
        <div className="mt-16">
          <FakeDashboard />
        </div>
      </section>

      {/* FEATURES */}
      <section className="fade-in-up">
        <div className="grid sm:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {[
            {
              title: "Rapide à lire",
              desc: "Un aperçu clair et exploitable instantanément.",
              icon: "⚡",
            },
            {
              title: "Stats utiles",
              desc: "On filtre le bruit : que ce qui t’aide vraiment.",
              icon: "📊",
            },
            {
              title: "Pensé pour toi",
              desc: "ZoneStat évolue autour de ton usage réel.",
              icon: "🎯",
            },
          ].map((f, i) => (
            <div
              key={i}
              className="card card-hover p-6 space-y-2 text-center"
            >
              <div className="text-3xl">{f.icon}</div>
              <h3 className="text-lg font-medium">{f.title}</h3>
              <p className="text-fg-subtle text-sm">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="fade-in-up max-w-4xl mx-auto">
        <div className="card card-hover p-8 space-y-8">
          <h2 className="text-xl font-semibold text-center">Comment ça marche</h2>

          <div className="grid sm:grid-cols-3 gap-6 text-sm text-fg-subtle">
            <div>
              <p className="uppercase text-xs tracking-wider font-semibold text-fg-muted mb-1">1. Repère</p>
              <p>Regarde les matchs du jour et identifie ceux qui méritent ton attention.</p>
            </div>
            <div>
              <p className="uppercase text-xs tracking-wider font-semibold text-fg-muted mb-1">2. Analyse</p>
              <p>Compare rapidement les dynamiques, stats et tendances importantes.</p>
            </div>
            <div>
              <p className="uppercase text-xs tracking-wider font-semibold text-fg-muted mb-1">3. Décide</p>
              <p>Avec une vue claire, tu prends de meilleures décisions.</p>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
