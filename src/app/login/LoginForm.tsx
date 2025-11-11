// src/app/login/LoginForm.tsx
"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

type State = { error?: string };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary w-full">
      {pending ? "Connexion…" : "Se connecter"}
    </button>
  );
}

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

export default function LoginForm({
  action,
  next,
  turnstileSiteKey,
  csrf,
}: {
  action: (state: State, formData: FormData) => Promise<State>;
  next: string;
  turnstileSiteKey: string;
  csrf: string;
}) {
  const [state, formAction] = useActionState(action, {} as State);
  const [csrfLocal, setCsrfLocal] = useState<string>(csrf || "");

  // --- Turnstile (widget natif) ---
  const captchaRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [tsToken, setTsToken] = useState<string>(""); // token courant
  const turnstileEnabled = !!turnstileSiteKey;

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

  useEffect(() => {
    if (!turnstileEnabled) return;
    const el = captchaRef.current;
    if (!el) return;

    // On (re)rend le widget jusqu’à ce que window.turnstile soit prêt
    function renderIfReady() {
      const ts: any = (window as any).turnstile;
      if (!ts || widgetIdRef.current) return;
      try {
        widgetIdRef.current = ts.render(el, {
          sitekey: turnstileSiteKey,
          theme: "light",
          callback: (token: string) => {
            setTsToken(token);
          },
          "expired-callback": () => {
            setTsToken("");
          },
          "error-callback": () => {
            setTsToken("");
          },
        });
      } catch {
        // on réessaie via l’interval
      }
    }

    renderIfReady();
    const i = setInterval(() => {
      if (widgetIdRef.current) clearInterval(i);
      else renderIfReady();
    }, 150);

    return () => {
      clearInterval(i);
      const ts: any = (window as any).turnstile;
      if (ts && widgetIdRef.current) ts.remove(widgetIdRef.current);
      widgetIdRef.current = null;
      setTsToken("");
    };
  }, [turnstileEnabled, turnstileSiteKey]);

  return (
    <form
      action={async (fd: FormData) => {
        // -- Sync CSRF depuis cookie juste avant l’envoi --
        const latest = readCookie("csrf");
        const token = extractToken(latest);
        const toSend = token || csrfValue;
        if (token) setCsrfLocal((prev) => (token !== prev ? token : prev));
        fd.set("csrf", toSend);

        // -- Normalisation email --
        const email = String(fd.get("email") || "").trim().toLowerCase();
        fd.set("email", email);

        // -- Injecte le token Turnstile si activé --
        if (turnstileEnabled) {
          if (!tsToken) {
            // On simule une erreur côté client : l’action retournera {error} si voulue, mais on peut aussi l’afficher ici.
            // On met quand même une valeur vide pour cohérence
            fd.set("cf-turnstile-response", "");
          } else {
            fd.set("cf-turnstile-response", tsToken);
          }
        }

        // Envoie au server action
        await formAction(fd);
      }}
      className="space-y-5 text-sm fade-in-up"
      onSubmit={(e) => {
        // (optionnel) hard-block si captcha requis mais manquant
        if (turnstileEnabled && !tsToken) {
          e.preventDefault();
          // Option UX : on peut mettre un message d’erreur local ici si besoin
          // mais on conserve ta logique d'erreur côté action pour uniformité.
          return;
        }
        const latest = readCookie("csrf");
        const token = extractToken(latest);
        if (token) setCsrfLocal((prev) => (token !== prev ? token : prev));
      }}
      aria-describedby={state?.error ? "login-error" : undefined}
    >
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="csrf" value={csrfValue} />
      {turnstileEnabled && (
        <input type="hidden" name="cf-turnstile-response" value={tsToken} readOnly />
      )}

      <div className="space-y-3">
        <input
          name="email"
          type="email"
          required
          placeholder="Email"
          className="input"
          autoComplete="email"
          aria-invalid={!!state?.error || undefined}
        />
        <input
          name="password"
          type="password"
          required
          placeholder="Mot de passe"
          className="input"
          autoComplete="current-password"
          minLength={6}
          aria-invalid={!!state?.error || undefined}
        />
      </div>

      {turnstileEnabled ? (
        <div
          ref={captchaRef}
          className="captcha-shell !border-0 !bg-transparent !shadow-none !p-0"
          aria-label="Vérification anti-bot"
        />
      ) : null}

      <SubmitButton />

      <div className="min-h-[1.25rem]" aria-live="polite">
        {state?.error && (
          <p id="login-error" className="text-[13px]" style={{ color: "var(--color-danger)" }}>
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
