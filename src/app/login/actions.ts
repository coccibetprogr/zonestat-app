// === FILE: src/app/login/actions.ts ===
"use server";

import { redirect } from "next/navigation";
import { headers, cookies } from "next/headers";
import { actionClient } from "@/utils/supabase/action";
import { verifyTurnstile } from "@/lib/turnstile";
import { rateLimit } from "@/utils/rateLimit";
import { safeNext } from "@/utils/safeNext";
import { log } from "@/utils/observability/log";
import crypto from "crypto";
import {
  isAllowedOrigin,
  getAllowedOriginsFromHeaders,
  isOriginAllowed,
} from "@/utils/security/origin";

export type LoginState = { error?: string };

function rlKey(...parts: string[]) {
  const secret = process.env.RL_KEY_SECRET;
  if (process.env.NODE_ENV === "production" && !secret) {
    log.error("rateLimit.missing_rl_key_secret_in_prod");
    throw new Error("Rate limit secret missing in production");
  }
  const hmac = crypto.createHmac("sha256", String(secret || "dev-only"));
  hmac.update(parts.join("|"));
  return hmac.digest("hex").slice(0, 48);
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  // ⚠️ Dans ton setup, headers()/cookies() sont typées async → on les attend.
  const h = await headers();
  const ip = h.get("x-zonestat-ip") ?? "unknown";
  const cookieStore = await cookies();

  // ---- ORIGIN CHECK (helper centralisé) ----
  const headerAllowed = isAllowedOrigin(h);
  const allowed = getAllowedOriginsFromHeaders(h);
  const requestOrigin = h.get("origin") || h.get("referer");
  if (!isOriginAllowed(requestOrigin, allowed)) {
    log.warn("auth.login.invalid_origin", { headerAllowed, requestOrigin });
    return { error: "Requête invalide (origin)." };
  }

  // ---- CSRF (double-submit) ----
  const csrfBodyRaw = formData.get("csrf")?.toString().trim() || "";
  const csrfBodyToken = csrfBodyRaw.split(":")[0] || csrfBodyRaw;
  const csrfCookieRaw = cookieStore.get("csrf")?.value || "";
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
  // IP fiabilisée par le middleware (ne jamais lire x-forwarded-*)
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

  // ---- TURNSTILE ----
  const okCaptcha = await verifyTurnstile(captcha, { ip });
  if (!okCaptcha) {
    return { error: "Vérification anti-bot échouée. Réessaie." };
  }

  // ---- AUTH ----
  const supabase = await actionClient(); // cookies mutables
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // petit délai pour ne pas permettre le timing attack
    await new Promise((r) => setTimeout(r, 300));
    return { error: "Email ou mot de passe incorrect." };
  }

  redirect(next);
}
