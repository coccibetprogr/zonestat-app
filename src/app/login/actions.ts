// src/app/login/actions.ts
"use server";

import { redirect } from "next/navigation";
import { headers, cookies } from "next/headers";
import { actionClient } from "@/utils/supabase/action";
import { verifyTurnstile } from "@/lib/turnstile";
import { rateLimit } from "@/utils/rateLimit";
import { safeNext } from "@/utils/safeNext";
import { log } from "@/utils/observability/log";
import crypto from "crypto";

export type LoginState = { error?: string };

function rlKey(...parts: string[]) {
  const secret = process.env.RL_KEY_SECRET;
  if (process.env.NODE_ENV === "production" && !secret) {
    // en prod, on exige la présence du secret pour produire des clés fiables
    log.error("rateLimit.missing_rl_key_secret_in_prod");
    // throw ou renvoyer une clé non déterministe ? On renvoie une valeur spéciale
    // pour que le caller puisse échouer proprement et éviter d'exposer un fallback non sécurisé.
    throw new Error("Rate limit secret missing in production");
  }
  // Utiliser HMAC plutôt que hash simple pour lier le secret
  const hmac = crypto.createHmac("sha256", String(secret || "dev-only"));
  hmac.update(parts.join("|"));
  return hmac.digest("hex").slice(0, 48);
}

function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function computeAllowedOrigin(host: string | null | undefined, protoHint?: string | null): string | null {
  if (!host) return null;
  const normalizedHost = host.trim();
  if (!normalizedHost) return null;
  if (protoHint) return `${protoHint}://${normalizedHost}`;
  const hostname = normalizedHost.split(":")[0]?.toLowerCase() || "";
  const isLocal =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.");
  const proto = isLocal ? "http" : "https";
  return `${proto}://${normalizedHost}`;
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const h = await headers();

  // ---- ORIGIN CHECK ----
  const forwardedHost = h.get("x-forwarded-host");
  const host = h.get("host");
  const protoHint = h.get("x-forwarded-proto");
  const inferredOrigin =
    computeAllowedOrigin(forwardedHost, protoHint) ||
    computeAllowedOrigin(host, protoHint);
  const envOrigin = (() => {
    const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
    if (!raw) return null;
    try {
      return new URL(raw.replace(/\/+$/, "")).origin;
    } catch {
      return null;
    }
  })();
  const allowed = new Set([envOrigin, inferredOrigin].filter(Boolean) as string[]);
  const requestOrigin =
    normalizeOrigin(h.get("origin")) ||
    normalizeOrigin(h.get("referer")) ||
    inferredOrigin;
  if (!requestOrigin || !allowed.has(requestOrigin)) {
    return { error: "Requête invalide (origin)." };
  }

  // ---- CSRF (double-submit) ----
  const csrfBodyRaw = formData.get("csrf")?.toString().trim() || "";
  const csrfBodyToken = csrfBodyRaw.split(":")[0] || csrfBodyRaw;
  const csrfCookieRaw = (await cookies()).get("csrf")?.value || "";
  const csrfCookieToken = csrfCookieRaw.split(":")[0] || csrfCookieRaw;
  if (!csrfBodyToken || !csrfCookieToken || csrfBodyToken !== csrfCookieToken) {
    log.warn("auth.login.csrf_mismatch", {
      hasBody: Boolean(csrfBodyToken),
      hasCookie: Boolean(csrfCookieToken),
      same: csrfBodyToken === csrfCookieToken,
    });
    return { error: "Requête invalide (csrf)." };
  }

  const next = safeNext(formData.get("next")?.toString());
  const email = formData.get("email")?.toString() || "";
  const password = formData.get("password")?.toString() || "";
  const captcha = formData.get("cf-turnstile-response")?.toString();

  // ---- RATE LIMIT ----
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  let rlIpKey: string;
  let rlAcctKey: string;
  try {
    rlIpKey = rlKey("login:ip", ip);
    rlAcctKey = rlKey("login:acct", email.toLowerCase(), ip);
  } catch (e: any) {
    log.error("auth.login.rlkey_error", { error: e?.message || String(e) });
    return { error: "Erreur serveur (config). Contacte l’administrateur." };
  }

  const rlIp = await rateLimit(rlIpKey);
  if (!rlIp.ok) return { error: "Trop de tentatives. Réessaie plus tard." };
  const rlAcct = await rateLimit(rlAcctKey);
  if (!rlAcct.ok) return { error: "Trop de tentatives. Réessaie plus tard." };

  // ---- TURNSTILE TOUJOURS APPELÉ ----
  // `verifyTurnstile` gère: en prod → config/token obligatoires (fail-closed),
  // en dev → bypass si non configuré.
  const okCaptcha = await verifyTurnstile(captcha, { ip });
  if (!okCaptcha) {
    return { error: "Vérification anti-bot échouée. Réessaie." };
  }

  // ---- AUTH ----
  const supabase = await actionClient(); // cookies mutables
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    await new Promise((r) => setTimeout(r, 300)); // petit délai anti-bruteforce
    return { error: "Email ou mot de passe incorrect." };
  }

  redirect(next);
}
