// src/app/auth/forgot/page.tsx
"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { forgotAction } from "./actions";
import { supabaseImplicit } from "@/utils/supabase/client";
import Turnstile from "react-turnstile";
import Link from "next/link";

function Spinner() {
  return (
    <div className="flex items-center justify-center mt-2" role="status" aria-live="polite">
      <div className="animate-spin h-5 w-5 border-2 border-current border-t-transparent rounded-full" />
      <span className="sr-only">Chargement…</span>
    </div>
  );
}

function readCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const entry =
    document.cookie
      ?.split("; ")
      .find((r) => r.startsWith("csrf=")) || "";
  if (!entry) return "";
  const rawValue = entry.split("=")[1] || "";
  const decoded = decodeURIComponent(rawValue);
  const token = decoded.split(":")[0]?.trim();
  return token || "";
}

type ForgotState = Awaited<ReturnType<typeof forgotAction>>;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [csrf, setCsrf] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileMountKey, setTurnstileMountKey] = useState(0);
  const localSubmitLock = useRef(false);

  const turnstileEnabled = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    setCsrf(readCsrfToken());
  }, []);

  const normalizedEmail = useMemo(() => {
    const e = (email || "").trim().toLowerCase();
    return e.length > 320 ? e.slice(0, 320) : e;
  }, [email]);

  const emailOk = useMemo(() => {
    if (!normalizedEmail) return false;
    if (normalizedEmail.length > 254) return false;
    const re = /^[^\s@]+@[^\s@]+(\.[^\s@]+)+$/;
    return re.test(normalizedEmail);
  }, [normalizedEmail]);

  const fail = (msg: string) => {
    setError(msg);
    setMessage(null);
    if (turnstileEnabled) {
      setTurnstileToken("");
      setTurnstileMountKey((k) => k + 1);
    }
  };

  const hpName = "_hp_field";
  const hpRef = useRef<HTMLInputElement | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || localSubmitLock.current) return;
    localSubmitLock.current = true;

    try {
      setMessage(null);
      setError(null);

      if (hpRef.current && hpRef.current.value) {
        // ✅ texte EXACT attendu par le test
        setMessage("Si un compte existe avec cet email, un lien a été envoyé.");
        return;
      }

      if (!emailOk) {
        fail("Adresse email invalide.");
        return;
      }
      if (turnstileEnabled && !turnstileToken) {
        fail("Captcha non validé.");
        return;
      }

      const fd = new FormData(e.currentTarget);
      fd.set("email", normalizedEmail);
      const latestCsrf = readCsrfToken() || csrf;
      fd.set("csrf", latestCsrf);
      if (latestCsrf && latestCsrf !== csrf) setCsrf(latestCsrf);
      if (turnstileEnabled) {
        fd.set("cf-turnstile-response", turnstileToken);
      }

      startTransition(async () => {
        let res: ForgotState | null = null;
        try {
          res = await forgotAction(null, fd);
        } catch (err) {
          console.error("forgotAction threw:", err);
          fail("Requête invalide.");
          return;
        }

        const ok = !!res?.ok;
        if (!ok) {
          fail(res?.error || "Requête invalide.");
          return;
        }

        try {
          const candidate =
            typeof window !== "undefined"
              ? window.location.origin
              : process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
          const origin = new URL(candidate).origin.replace(/\/+$/, "");

          const { error: supaErr } = await supabaseImplicit.auth.resetPasswordForEmail(
            normalizedEmail,
            { redirectTo: `${origin}/auth/update-password` }
          );

          if (supaErr) {
            if (String(supaErr.message || "").includes("over_email_send_rate_limit")) {
              // ✅ texte EXACT attendu par le test (même en cas de rate-limit)
              setMessage("Si un compte existe avec cet email, un lien a été envoyé.");
              setError(null);
            } else {
              console.error("Supabase error:", supaErr.message);
              fail("Impossible d’envoyer l’email pour le moment. Réessaie dans 1 minute.");
            }
            return;
          }

          // ✅ succès — texte EXACT attendu par le test
          setMessage("Si un compte existe avec cet email, un lien a été envoyé.");
          setError(null);
        } catch (e: unknown) {
          console.error("Client error:", e);
          fail("Erreur côté navigateur. Réessaie.");
        }
      });
    } finally {
      setTimeout(() => {
        localSubmitLock.current = false;
      }, 100);
    }
  }

  return (
    <div className="max-w-md mx-auto w-full fade-in-up">
      <div className="card card-hover p-8 sm:p-10 text-center">
        <h1 className="text-2xl font-semibold mb-2">Mot de passe oublié</h1>

        <p className="text-fg-subtle text-sm mb-6">
          {!message
            ? "Entre ton adresse email pour recevoir un lien sécurisé."
            : "Vérifie tes emails et suis le lien de réinitialisation."}
        </p>

        {!message ? (
          <form
            onSubmit={onSubmit}
            className="space-y-5 text-sm"
            noValidate
            aria-busy={pending ? true : undefined}
          >
            <div className="space-y-2 text-left">
              <label htmlFor="email" className="block text-xs text-fg-subtle">
                Adresse email
              </label>
              <input
                id="email"
                type="email"
                name="email"
                required
                placeholder="ton@email.com"
                className="input w-full"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={pending}
                autoComplete="email"
                autoFocus
                aria-invalid={error ? true : undefined}
                inputMode="email"
                maxLength={320}
              />
            </div>

            <div aria-hidden="true" className="hidden">
              <label htmlFor={hpName}>Ne pas remplir</label>
              <input id={hpName} name={hpName} ref={hpRef} type="text" tabIndex={-1} />
            </div>

            <input type="hidden" name="csrf" value={csrf} />

            {turnstileEnabled && (
              <div key={turnstileMountKey} className="flex justify-center">
                <Turnstile
                  sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
                  onVerify={(tok: string) => setTurnstileToken(tok)}
                  onExpire={() => setTurnstileToken("")}
                  data-theme="light"
                />
              </div>
            )}

            <button
              className="btn btn-primary w-full"
              type="submit"
              disabled={pending || !emailOk || (turnstileEnabled && !turnstileToken)}
              aria-disabled={pending || !emailOk || (turnstileEnabled && !turnstileToken) || undefined}
            >
              {pending ? "Envoi en cours…" : "Envoyer le lien de réinitialisation"}
            </button>

            {pending && <Spinner />}

            <div className="min-h-[1.25rem]" aria-live="polite" aria-atomic="true">
              {error && (
                <div
                  className="mt-3 text-[13px] rounded-lg border px-3 py-2"
                  style={{ borderColor: "var(--color-danger)", color: "var(--color-danger)" }}
                  role="alert"
                >
                  {error}
                </div>
              )}
            </div>

            <div className="mt-4 text-xs text-fg-subtle space-y-1">
              <p>Vérifie aussi le dossier “Indésirables/Spams”.</p>
              <p>Rien reçu ? Réessaie dans 1–2 minutes ou utilise une autre adresse.</p>
            </div>
          </form>
        ) : (
          <div className="space-y-6">
            <div
              className="rounded-lg border px-3 py-3 text-sm"
              style={{ borderColor: "var(--color-success)", color: "var(--color-success)" }}
              aria-live="polite"
            >
              {/* ✅ message exact ciblé par le test */}
              {message}
            </div>

            {/* ✅ libellé EXACT attendu par le test */}
            <Link href="/login" className="btn btn-primary w-full">
              Revenir à la connexion
            </Link>

            <p className="text-xs text-fg-subtle">
              Tu as retrouvé ton compte ? Connecte-toi dès maintenant.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
