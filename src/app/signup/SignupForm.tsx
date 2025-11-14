// src/app/signup/SignupForm.tsx
"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

type State = { error?: string; success?: string };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary w-full">
      {pending ? "Création…" : "Créer mon compte"}
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

export default function SignupForm({
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

  // Bootstrap CSRF + sync sur focus (comme LoginForm)
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

  // Montage Turnstile + gestion du token
  useEffect(() => {
    if (!turnstileEnabled) return;
    const el = captchaRef.current;
    if (!el) return;

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
            // cohérent mais vide si l’utilisateur n’a pas validé
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
        // Hard-block côté client si captcha requis mais manquant
        if (turnstileEnabled && !tsToken) {
          e.preventDefault();
          return;
        }
        const latest = readCookie("csrf");
        const token = extractToken(latest);
        if (token) setCsrfLocal((prev) => (token !== prev ? token : prev));
      }}
      aria-describedby={state?.error ? "signup-error" : undefined}
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
        />
        <input
          name="password"
          type="password"
          required
          placeholder="Mot de passe (min. 6 caractères)"
          className="input"
          autoComplete="new-password"
          minLength={6}
        />
      </div>

      {turnstileSiteKey ? (
        <div
          ref={captchaRef}
          className="captcha-shell !border-0 !bg-transparent !shadow-none !p-0"
          aria-label="Vérification anti-bot"
        />
      ) : null}

      <SubmitButton />

      <div className="min-h-[1.25rem]" aria-live="polite">
        {state?.error && (
          <p
            id="signup-error"
            className="text-[13px]"
            style={{ color: "var(--color-danger)" }}
          >
            {state.error}
          </p>
        )}
        {state?.success && (
          <p className="text-[13px]" style={{ color: "var(--color-success)" }}>
            {state.success}
          </p>
        )}
      </div>
    </form>
  );
}
