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

// Si tu as exporté le type ForgotState côté ./actions, importe-le.
// Sinon on reste "sûr" en inférant via ReturnType :
type ForgotState = Awaited<ReturnType<typeof forgotAction>>;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [csrf, setCsrf] = useState("");
  const [message, setMessage] = useState<string | null>(null); // succès
  const [error, setError] = useState<string | null>(null);     // erreur
  const [pending, startTransition] = useTransition();
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileMountKey, setTurnstileMountKey] = useState(0); // force re-render widget
  const localSubmitLock = useRef(false);

  // Activer/désactiver Turnstile selon la présence de la clé publique
  const turnstileEnabled = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  // Récupération du cookie CSRF côté client (pas de window en SSR)
  useEffect(() => {
    setCsrf(readCsrfToken());
  }, []);

  // Email normalisé (trim + lowercase) et borné en longueur
  const normalizedEmail = useMemo(() => {
    const e = (email || "").trim().toLowerCase();
    return e.length > 320 ? e.slice(0, 320) : e;
  }, [email]);

  // Validation locale d'email (pattern simple + longueur)
  const emailOk = useMemo(() => {
    if (!normalizedEmail) return false;
    if (normalizedEmail.length > 254) return false;
    const re = /^[^\s@]+@[^\s@]+(\.[^\s@]+)+$/;
    return re.test(normalizedEmail);
  }, [normalizedEmail]);

  // Remonte une erreur UX commune et remet le captcha à zéro si présent
  const fail = (msg: string) => {
    setError(msg);
    setMessage(null);
    if (turnstileEnabled) {
      setTurnstileToken("");
      setTurnstileMountKey((k) => k + 1);
    }
  };

  // Honeypot pour bots (invisible)
  const hpName = "_hp_field";
  const hpRef = useRef<HTMLInputElement | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || localSubmitLock.current) return; // anti double-clic
    localSubmitLock.current = true;

    try {
      setMessage(null);
      setError(null);

      // Honeypot
      if (hpRef.current && hpRef.current.value) {
        setMessage("Si un compte correspond à cet email, un lien vient d’être envoyé. Pense à vérifier les spams.");
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
      // On remplace la valeur d'email par la version normalisée
      fd.set("email", normalizedEmail);
      const latestCsrf = readCsrfToken() || csrf;
      fd.set("csrf", latestCsrf);
      if (latestCsrf && latestCsrf !== csrf) setCsrf(latestCsrf);
      if (turnstileEnabled) {
        fd.set("cf-turnstile-response", turnstileToken);
      }

      startTransition(async () => {
        // 1) Validation serveur (Origin / rate-limit / Turnstile / CSRF)
        let res: ForgotState | null = null;
        try {
          res = await forgotAction(null, fd);
        } catch (err) {
          console.error("forgotAction threw:", err);
          fail("Requête invalide.");
          return;
        }

        // Certains handlers renvoient { ok?: boolean, error?: string }
        const ok = !!res?.ok;
        if (!ok) {
          fail(res?.error || "Requête invalide.");
          return;
        }

        // 2) Envoi réel de l’email via Supabase — redirectTo = host courant
        try {
          // origin robuste (client d’abord, fallback var env)
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
              setMessage(
                "Un email vient déjà d’être envoyé récemment. Vérifie ta boîte mail (et les spams)."
              );
              setError(null);
            } else {
              console.error("Supabase error:", supaErr.message);
              fail("Impossible d’envoyer l’email pour le moment. Réessaie dans 1 minute.");
            }
            return;
          }

          // ✅ Succès : on cache le formulaire, on affiche un call-to-action de connexion
          setMessage(
            "Si un compte correspond à cet email, un lien vient d’être envoyé. Pense à vérifier les spams."
          );
          setError(null);
        } catch (e: unknown) {
          console.error("Client error:", e);
          fail("Erreur côté navigateur. Réessaie.");
        }
      });
    } finally {
      // On relâche le lock très légèrement après pour éviter les double-clics frénétiques
      setTimeout(() => {
        localSubmitLock.current = false;
      }, 100);
    }
  }

  // --- UI STABLE (un seul wrapper / une seule card) ---
  return (
    <div className="max-w-md mx-auto w-full fade-in-up">
      <div className="card card-hover p-8 sm:p-10 text-center">
        {/* Titre reste identique pour une structure SSR stable */}
        <h1 className="text-2xl font-semibold mb-2">
          Réinitialiser le mot de passe
        </h1>

        {/* Sous-titre change légèrement selon l'état mais reste en place */}
        <p className="text-fg-subtle text-sm mb-6">
          {!message
            ? "Entre ton adresse email pour recevoir un lien sécurisé."
            : "Vérifie tes emails et suis le lien de réinitialisation."}
        </p>

        {/* CONTENU PRINCIPAL : soit le formulaire, soit la vue de confirmation */}
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

            {/* Honeypot anti-bots */}
            <div aria-hidden="true" className="hidden">
              <label htmlFor={hpName}>Ne pas remplir</label>
              <input id={hpName} name={hpName} ref={hpRef} type="text" tabIndex={-1} />
            </div>

            {/* CSRF */}
            <input type="hidden" name="csrf" value={csrf} />

            {/* Turnstile centré (uniquement si configuré) */}
            {turnstileEnabled && (
              <div key={turnstileMountKey} className="flex justify-center">
                <Turnstile
                  sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
                  onVerify={(tok: string) => setTurnstileToken(tok)}
                  onExpire={() => setTurnstileToken("")}
                  // NB: certaines versions n'exposent pas onLoad/onError dans les typings
                  // "data-theme" reste supporté comme attribut data-*
                  data-theme="light"
                />
              </div>
            )}

            <button
              className="btn btn-primary w-full"
              type="submit"
              disabled={
                pending ||
                !emailOk ||
                (turnstileEnabled && !turnstileToken)
              }
              aria-disabled={
                pending ||
                !emailOk ||
                (turnstileEnabled && !turnstileToken) ||
                undefined
              }
            >
              {pending ? "Envoi en cours…" : "Envoyer le lien de réinitialisation"}
            </button>

            {pending && <Spinner />}

            {/* Zone messages (stable) */}
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

            {/* Aides (on ne les montre que quand le formulaire est visible) */}
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
              {message}
            </div>

            <Link href="/login" className="btn btn-primary w-full">
              Se connecter
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
