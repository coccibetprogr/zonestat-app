import "./globals.css";
import Link from "next/link";
import Script from "next/script";
import { serverClient } from "@/utils/supabase/server";
import LogoutForm from "@/components/LogoutForm";
import type React from "react";

export const metadata = {
  title: "ZoneStat",
  description: "Le match avant le match.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await serverClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html lang="fr">
      <body
        className="bg-bg text-fg-base min-h-screen flex flex-col"
        style={{ "--color-primary": "#374bd3" } as React.CSSProperties}
      >
        {process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ? (
          <Script
            src="https://challenges.cloudflare.com/turnstile/v0/api.js"
            strategy="afterInteractive"
            async
            defer
          />
        ) : null}

        <header className="sticky top-0 z-50 w-full bg-[var(--color-primary)] text-white border-b border-black/10">
          <div className="w-full max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <Link
                href="/"
                className="text-[20px] font-semibold tracking-tight no-hover-color"
              >
                ZoneStat
              </Link>

              <nav className="hidden md:flex items-center gap-6 text-sm">
                {user ? (
                  <div className="flex items-center gap-3">
                    <Link href="/account" className="btn btn-primary">
                      Mon compte
                    </Link>
                    <LogoutForm buttonClassName="btn btn-ghost" />
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <Link href="/login" className="btn btn-ghost">
                      Se connecter
                    </Link>
                    <Link href="/signup" className="btn btn-primary">
                      S’inscrire
                    </Link>
                  </div>
                )}
              </nav>

              {/* Menu mobile */}
              <details className="md:hidden relative">
                <summary
                  className="list-none h-10 w-10 rounded-full flex items-center justify-center border border-line hover:bg-bg-hover cursor-pointer"
                  aria-label="Ouvrir le menu"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    role="img"
                    aria-hidden="true"
                  >
                    <path
                      d="M3 6h18M3 12h18M3 18h18"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </summary>
                <div className="absolute right-0 mt-2 w-48 rounded-xl border border-line bg-white shadow-lg py-2">
                  {user ? (
                    <>
                      <Link
                        href="/dashboard"
                        className="block px-4 py-2 text-sm hover:bg-bg-soft"
                      >
                        Dashboard
                      </Link>
                      <Link
                        href="/account"
                        className="block px-4 py-2 text-sm hover:bg-bg-soft"
                      >
                        Mon compte
                      </Link>
                      <div className="border-t border-line mt-1 pt-1 px-2">
                        <LogoutForm buttonClassName="w-full text-left px-2 py-1 text-sm hover:bg-bg-soft rounded-lg" />
                      </div>
                    </>
                  ) : (
                    <>
                      <Link
                        href="/login"
                        className="block px-4 py-2 text-sm hover:bg-bg-soft"
                      >
                        Se connecter
                      </Link>
                      <Link
                        href="/signup"
                        className="block px-4 py-2 text-sm hover:bg-bg-soft"
                      >
                        S’inscrire
                      </Link>
                    </>
                  )}
                </div>
              </details>
            </div>
          </div>
        </header>

        <main className="flex-1 py-6">
          <div className="w-full max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
