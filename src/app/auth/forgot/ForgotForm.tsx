"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ForgotState } from "./actions";

type TurnstileRenderOptions = {
  sitekey: string;
  theme?: string;
  callback?: (token: string) => void;
  "expired-callback"?: () => void;
  "error-callback"?: () => void;
};

type TurnstileGlobal = {
  render: (element: HTMLElement, options: TurnstileRenderOptions) => string;
  remove: (widgetId: string) => void;
};

type TurnstileWindow = Window & { turnstile?: TurnstileGlobal };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary w-full">
      {pending ? "Envoi…" : "Envoyer le lien"}
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

export default function ForgotForm({
  action,
  turnstileSiteKey,
  csrf,
}: {
  action: (state: ForgotState, formData: FormData) => Promise<ForgotState>;
  turnstileSiteKey: string;
  csrf: string;
}) {
  const [state, formAction] = useActionState(action, {} as ForgotState);
  const [csrfLocal, setCsrfLocal] = useState<string>(csrf || "");
  const captchaRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);

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
    if (!turnstileSiteKey) return;

    function renderIfReady() {
      const ts = (window as TurnstileWindow).turnstile;
      const el = captchaRef.current;
      if (!ts || !el || widgetIdRef.current) return;

      try {
        widgetIdRef.current = ts.render(el, {
          sitekey: turnstileSiteKey,
          theme: "light",
        });
      } catch {
        // noop
      }
    }

    renderIfReady();
    const i = setInterval(() => {
      if (widgetIdRef.current) {
        clearInterval(i);
      } else {
        renderIfReady();
      }
    }, 150);

    return () => {
      clearInterval(i);
      const ts = (window as TurnstileWindow).turnstile;
      if (ts && widgetIdRef.current) ts.remove(widgetIdRef.current);
      widgetIdRef.current = null;
    };
  }, [turnstileSiteKey]);

  // 🔎 On dérive un message d’erreur de façon typesafe,
  // même si ForgotState est une union (avec ou sans `error`)
  const errorMessage = useMemo(() => {
    if (!state) return undefined;
    if ("error" in state && state.error) {
      return state.error;
    }
    return undefined;
  }, [state]);

  return (
    <form
      action={formAction}
      className="space-y-5 text-sm fade-in-up"
      onSubmit={() => {
        const latest = readCookie("csrf");
        const token = extractToken(latest);
        if (token) setCsrfLocal((prev) => (token !== prev ? token : prev));
      }}
    >
      <input type="hidden" name="csrf" value={csrfValue} />

      <div className="space-y-3">
        <input
          name="email"
          type="email"
          required
          placeholder="ton@email.com"
          className="input"
          autoComplete="email"
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
        {state?.ok && (
          <p className="text-[13px]" style={{ color: "var(--color-success)" }}>
            Si un compte existe avec cet email, un lien a été envoyé.
          </p>
        )}
        {errorMessage && (
          <p className="text-[13px]" style={{ color: "var(--color-danger)" }}>
            {errorMessage}
          </p>
        )}
      </div>
    </form>
  );
}
