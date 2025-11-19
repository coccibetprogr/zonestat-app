import "../globals.css";
import Link from "next/link";
import type React from "react";

// Ce layout est statique : il permet à Next de prerender les pages marketing
export const dynamic = "auto";

export default function PublicRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body
        className="bg-bg text-fg-base min-h-screen"
        style={{ "--color-primary": "#374bd3" } as React.CSSProperties}
      >
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
                <Link href="/login" className="btn btn-ghost">
                  Se connecter
                </Link>
                <Link href="/signup" className="btn btn-primary">
                  S’inscrire
                </Link>
              </nav>
            </div>
          </div>
        </header>

        <main className="flex-grow py-8">
          <div className="w-full max-w-[1000px] mx-auto px-4 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
