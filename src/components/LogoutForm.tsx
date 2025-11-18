// src/components/LogoutForm.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const cookies = document.cookie ? document.cookie.split("; ") : [];
  for (const c of cookies) {
    const idx = c.indexOf("=");
    if (idx === -1) continue;
    const key = c.slice(0, idx);
    if (key === name) return decodeURIComponent(c.slice(idx + 1));
  }
  return null;
}

function extractToken(value: string | null | undefined): string {
  if (!value) return "";
  const token = value.split(":")[0]?.trim();
  return token || "";
}

export default function LogoutForm({ buttonClassName }: { buttonClassName?: string }) {
  const [csrfLocal, setCsrfLocal] = useState<string>("");

  // Lecture ponctuelle au mount + resync au submit
  useEffect(() => {
    let mounted = true;

    const sync = () => {
      const value = readCookie("csrf") || "";
      const token = extractToken(value);
      if (!mounted || !token) return;
      setCsrfLocal((prev) => (token !== prev ? token : prev));
    };

    async function ensureCsrf() {
      try {
        await fetch("/csrf", {
          credentials: "include",
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
      } catch {
        /* noop */
      } finally {
        sync();
      }
    }

    ensureCsrf();
    if (typeof window !== "undefined") window.addEventListener("focus", sync);

    return () => {
      mounted = false;
      if (typeof window !== "undefined") window.removeEventListener("focus", sync);
    };
  }, []);

  const csrfValue = useMemo(() => csrfLocal || "", [csrfLocal]);

  return (
    <form
      method="POST"
      action="/auth/logout"
      onSubmit={() => {
        const latest = readCookie("csrf");
        const token = extractToken(latest);
        if (token) setCsrfLocal((prev) => (token !== prev ? token : prev));
      }}
    >
      <input type="hidden" name="csrf" value={csrfValue} />
      <button type="submit" className={buttonClassName || "btn btn-ghost"}>
        Se déconnecter
      </button>
    </form>
  );
}
