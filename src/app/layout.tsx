// src/app/layout.tsx
// NOTE: Layout SSR conservé (lecture user côté serveur) + force-dynamic.
// Cette version préserve ton header conditionnel EXACT, sans rien retirer.

import "./globals.css";
import Link from "next/link";
import Script from "next/script";
import { serverClient } from "@/utils/supabase/server";
import LogoutForm from "@/components/LogoutForm";

export const metadata = {
  title: "ZoneStat",
  description: "Le match avant le match.",
};

// ⚠️ Conservé tel quel pour que le header reflète toujours la session côté serveur.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Lecture SSR de la session Supabase (inchangée)
  const supabase = await serverClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html lang="fr">
      <body className="bg-bg text-fg-base min-h-screen flex flex-col">
        {/* Script Turnstile conservé */}
        {process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ? (
          <Script
            src="https://challenges.cloudflare.com/turnstile/v0/api.js"
            strategy="afterInteractive"
            async
            defer
          />
        ) : null}

        <header className="sticky top-0 z-50 w-full bg-white/80 backdrop-blur-md border-b border-line">
          <div className="w-full max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <Link href="/" className="text-[20px] font-semibold tracking-tight">
                Zone<span style={{ color: "var(--color-primary)" }}>Stat</span>
              </Link>

              {/* Nav desktop : strictement identique */}
              <nav className="hidden md:flex items-center gap-6 text-sm">
                {user ? (
                  <div className="flex items-center gap-3">
                    <Link href="/account" className="btn btn-primary">Mon compte</Link>
                    <LogoutForm buttonClassName="btn btn-ghost" />
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <Link href="/login" className="btn btn-ghost">Se connecter</Link>
                    <Link href="/signup" className="btn btn-primary">S’inscrire</Link>
                  </div>
                )}
              </nav>

              {/* Menu mobile : strictement identique */}
              <details className="md:hidden relative">
                <summary
                  className="list-none h-10 w-10 rounded-full flex items-center justify-center border border-line hover:bg-bg-hover cursor-pointer"
                  aria-label="Ouvrir le menu"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" role="img" aria-hidden="true">
                    <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </summary>

                <div className="absolute right-0 mt-2 min-w-[250px] rounded-xl border border-line bg-bg-card shadow-card overflow-hidden">
                  <div className="p-2">
                    {user ? (
                      <>
                        <Link href="/account" className="navlink block px-3 py-2 rounded-lg hover:bg-bg-hover">
                          Mon compte
                        </Link>
                      </>
                    ) : (
                      <>
                        <Link href="/login" className="navlink block px-3 py-2 rounded-lg hover:bg-bg-hover">
                          Se connecter
                        </Link>
                        <Link href="/signup" className="navlink block px-3 py-2 rounded-lg hover:bg-bg-hover">
                          S’inscrire
                        </Link>
                      </>
                    )}
                  </div>
                  {user ? (
                    <div className="p-2 border-t border-line">
                      <LogoutForm buttonClassName="btn btn-ghost w-full" />
                    </div>
                  ) : null}
                </div>
              </details>
            </div>
          </div>
        </header>

        <main className="flex-grow py-8 sm:py-10">
          <div className="w-full max-w-[1000px] mx-auto px-4 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
