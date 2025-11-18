// src/app/(public)/layout.tsx
import "../globals.css";
import Link from "next/link";

// Ce layout est statique : il permet à Next de prerender les pages marketing
export const dynamic = "auto";

export default function PublicRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="bg-bg text-fg-base min-h-screen">
        <header className="sticky top-0 z-50 w-full bg-white/80 backdrop-blur-md border-b border-line">
          <div className="w-full max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <Link href="/" className="text-[20px] font-semibold tracking-tight">
                Zone<span style={{ color: "var(--color-primary)" }}>Stat</span>
              </Link>
              <nav className="hidden md:flex items-center gap-6 text-sm">
                <Link href="/login" className="btn btn-ghost">Se connecter</Link>
                <Link href="/signup" className="btn btn-primary">S’inscrire</Link>
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
