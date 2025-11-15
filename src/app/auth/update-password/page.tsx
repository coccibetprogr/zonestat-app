// src/app/auth/update-password/page.tsx
"use client";

import { useEffect, useRef, useState, useCallback, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { supabaseImplicit as supabase } from "@/utils/supabase/client";
import { updatePasswordGate } from "./actions";
import Turnstile from "react-turnstile";

type Parsed = {
  token: string | null;
  token_hash: string | null;      // param renvoyé par Supabase
  type: string;                   // recovery | magiclink | …
  code: string | null;            // PKCE
  access_token: string | null;    // legacy hash (fragment)
  refresh_token: string | null;   // legacy hash (fragment)
  hashType: string;               // type dans le fragment
};

type ErrorKind = "none" | "too_short" | "same_password" | "expired" | "generic";

function Spinner() {
  return (
    <div className="flex items-center justify-center mt-2" role="status" aria-live="polite">
      <div className="animate-spin h-5 w-5 border-2 border-current border-t-transparent rounded-full" />
      <span className="sr-only">Chargement…</span>
    </div>
  );
}

// ✅ lit et DECODE le cookie (important si ":" est encodé en %3A)
function readCookie(name: string): string {
  if (typeof document === "undefined") return "";
  const entry = document.cookie.split("; ").find((r) => r.startsWith(name + "="));
  if (!entry) return "";
  const rawValue = entry.slice(name.length + 1);
  try {
    return decodeURIComponent(rawValue);
  } catch {
    return rawValue;
  }
}

export default function UpdatePasswordPage() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [pending, startTransition] = useTransition();
  const localSubmitLock = useRef(false);

  const [ready, setReady] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<ErrorKind>("none");
  const [csrf, setCsrf] = useState(""); // token-only
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileMountKey, setTurnstileMountKey] = useState(0);

  const turnstileEnabled = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  // -- CSRF bootstrap : force le cookie, puis stocke le token-only côté state
  useEffect(() => {
    let mounted = true;

    async function ensureCsrf() {
      try {
        await fetch("/csrf", {
          credentials: "include",
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
      } catch {
        // ignore
      } finally {
        const value = readCookie("csrf");       // ← décodé
        const token = value.split(":")[0] || "";
        if (mounted) setCsrf(token);
      }
    }

    ensureCsrf();

    function onFocus() {
      const value = readCookie("csrf");         // ← décodé
      const token = value.split(":")[0] || "";
      setCsrf((prev) => (token && token !== prev ? token : prev));
    }
    if (typeof window !== "undefined") window.addEventListener("focus", onFocus);

    return () => {
      mounted = false;
      if (typeof window !== "undefined") window.removeEventListener("focus", onFocus);
    };
  }, []);

  const parseFromHref = useCallback((href: string): Parsed => {
    const url = new URL(href);
    const search = url.searchParams;
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
    return {
      token: search.get("token"),
      token_hash: search.get("token_hash"),
      type: (search.get("type") || "").toLowerCase(),
      code: search.get("code"),
      access_token: hashParams.get("access_token"),
      refresh_token: hashParams.get("refresh_token"),
      hashType: (hashParams.get("type") || "").toLowerCase(),
    };
  }, []);

  const tryAll = useCallback(async (href: string) => {
    setOk(null);
    setReady(false);
    setErrorKind("none");

    const { token, token_hash, type, code, access_token, refresh_token, hashType } =
      parseFromHref(href);

    try {
      // 0) Session déjà active ?
      const { data: s0 } = await supabase.auth.getSession();
      if (s0?.session) {
        setReady(true);
        return true;
      }

      // 1) Legacy hash (fragment)
      if (access_token && refresh_token && hashType === "recovery") {
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
        if (!error) {
          setReady(true);
          return true;
        }
      }

      // 2) OTP moderne
      if (token_hash && (type === "recovery" || type === "magiclink")) {
        const { error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash });
        if (!error) {
          setReady(true);
          return true;
        }
      }

      // 3) OTP legacy via ?token=…
      if (token && (type === "recovery" || type === "magiclink")) {
        const { error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: token });
        if (!error) {
          setReady(true);
          return true;
        }
      }

      // 4) PKCE : ?code=…
      if (code) {
        const ex = await supabase.auth.exchangeCodeForSession(code);
        if (!ex.error) {
          setReady(true);
          return true;
        }
      }

      // 5) Échec → lien invalide/expiré
      setErrorKind("expired");
      setReady(false);
      return false;
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.error("[update-password] tryAll error:", errorMessage);
      setErrorKind("generic");
      setReady(false);
      return false;
    }
  }, [parseFromHref]);

  useEffect(() => {
    void tryAll(window.location.href);
  }, [tryAll]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || localSubmitLock.current) return;
    localSubmitLock.current = true;

    setOk(null);
    setErrorKind("none");

    try {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess?.session) {
        setErrorKind("expired");
        setReady(false);
        return;
      }

      const formEl =
        (e.currentTarget instanceof HTMLFormElement ? e.currentTarget : null) ||
        formRef.current;
      if (!formEl) {
        setErrorKind("generic");
        return;
      }

      const fd = new FormData(formEl);
      const password = String(fd.get("password") ?? "").trim();

      if (password.length < 6) {
        setErrorKind("too_short");
        return;
      }

      // 🔒 CSRF re-sync (decode + token-only)
      const value = readCookie("csrf");       // ← décodé
      const tokenOnly = (value.split(":")[0] || csrf).trim();
      fd.set("csrf", tokenOnly);

      // 🛡️ Turnstile (si visible)
      if (turnstileEnabled) {
        fd.set("cf-turnstile-response", turnstileToken || "");
      }

      // 1) Garde serveur : Origin/CSRF/Turnstile/Rate-limit
      const res = await updatePasswordGate(null, fd);
      if (!res?.ok) {
        const msg = (res?.error || "").toLowerCase();
        if (msg.includes("csrf") || msg.includes("origin") || msg.includes("expir")) {
          setErrorKind("expired");
          setReady(false);
        } else {
          setErrorKind("generic");
        }
        if (turnstileEnabled) {
          setTurnstileToken("");
          setTurnstileMountKey((k) => k + 1);
        }
        return;
      }

      // 2) Mise à jour réelle du mot de passe côté Supabase
      startTransition(async () => {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) {
          const rawMsg = String(error.message || "");
          const msg = rawMsg.toLowerCase();
          if (error.status === 422 || /should be different|différent/i.test(rawMsg)) {
            setErrorKind("same_password");
          } else if (/expired|invalid/i.test(msg)) {
            setErrorKind("expired");
            setReady(false);
          } else {
            setErrorKind("generic");
          }
          console.error("[update-password] updateUser error:", error.message);
          if (turnstileEnabled) {
            setTurnstileToken("");
            setTurnstileMountKey((k) => k + 1);
          }
          return;
        }

        setOk("Mot de passe mis à jour ✅ Redirection…");
        setTimeout(() => router.push("/login"), 1200);
      });
    } finally {
      setTimeout(() => { localSubmitLock.current = false; }, 100);
    }
  }

  // Texte d’erreur unique selon le type
  const errorText = useMemo(() => {
    switch (errorKind) {
      case "too_short":
        return "Mot de passe trop court (minimum 6 caractères).";
      case "same_password":
        return "Le nouveau mot de passe doit être différent de l’ancien.";
      case "expired":
        return "Ton lien de récupération est invalide ou a expiré.";
      case "generic":
        return "Un problème est survenu pendant la réinitialisation.";
      default:
        return null;
    }
  }, [errorKind]);

  // On ne propose de redemander un lien QUE si le lien est expiré/invalide
  const showAskNewLink = errorKind === "expired";

  return (
    <div className="max-w-md mx-auto w-full fade-in-up">
      <div className="card card-hover p-8 sm:p-10">
        <h1 className="text-2xl font-semibold text-center mb-2">
          Définir un nouveau mot de passe
        </h1>
        <p className="text-center text-fg-subtle text-sm mb-6">
          Saisis un nouveau mot de passe pour ton compte.
        </p>

        {/* Formulaire principal */}
        {ready && !showAskNewLink && (
          <form
            ref={formRef}
            onSubmit={onSubmit}
            className="space-y-5 text-sm"
            noValidate
            aria-busy={pending ? true : undefined}
          >
            <input
              name="password"
              type="password"
              required
              placeholder="Nouveau mot de passe (≥ 6 caractères)"
              className="input"
              minLength={6}
              autoComplete="new-password"
              aria-invalid={errorKind !== "none" ? true : undefined}
              aria-describedby={errorText ? "pw-error" : undefined}
            />

            {/* Erreurs inline */}
            {errorText && (
              <p
                id="pw-error"
                className="text-sm -mt-2"
                role="alert"
                aria-live="assertive"
                style={{ color: "var(--color-danger)" }}
              >
                {errorText}
              </p>
            )}

            {/* CSRF */}
            <input type="hidden" name="csrf" value={csrf} />

            {/* Turnstile (optionnel) */}
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
              disabled={pending || (turnstileEnabled && !turnstileToken)}
              aria-disabled={pending || (turnstileEnabled && !turnstileToken) || undefined}
            >
              {pending ? "Mise à jour…" : "Mettre à jour"}
            </button>

            {pending && <Spinner />}

            {/* Zone messages finale */}
            <div className="min-h-[1.25rem] mt-2 text-sm" aria-live="polite">
              {ok && <p style={{ color: "var(--color-success)" }}>{ok}</p>}
            </div>
          </form>
        )}

        {/* État: demander un nouveau lien (lien expiré/invalid) */}
        {showAskNewLink && (
          <div className="text-sm space-y-4">
            <div className="p-3 rounded-lg border border-line bg-bg-card">
              {errorText && (
                <p className="mb-1" style={{ color: "var(--color-danger)" }}>
                  {errorText}
                </p>
              )}
              <p className="text-fg-subtle">
                Pour continuer, redemande un nouveau lien de réinitialisation par email.
              </p>
            </div>
            <button
              className="btn w-full"
              type="button"
              onClick={() => router.push("/auth/forgot")}
            >
              Redemander un lien par email
            </button>
          </div>
        )}

        {/* Loader sobre */}
        {!ready && !showAskNewLink && <div>Vérification du lien…</div>}
      </div>
    </div>
  );
}
