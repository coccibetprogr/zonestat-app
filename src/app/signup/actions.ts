// src/app/signup/actions.ts
"use server";

import { redirect } from "next/navigation";
import { headers, cookies } from "next/headers";
import { actionClient } from "@/utils/supabase/action";
import { verifyTurnstile } from "@/lib/turnstile";
import { rateLimit } from "@/utils/rateLimit";
import { safeNext } from "@/utils/safeNext";
import { log } from "@/utils/observability/log";
import crypto from "crypto";
import { getAllowedOriginsFromHeaders, isOriginAllowed } from "@/utils/security/origin";

export type SignupState = { error?: string; success?: string };

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

export async function signupAction(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const h = await headers();

  // ---- ORIGIN CHECK (helper centralisé) ----
  const allowed = getAllowedOriginsFromHeaders(h);
  const requestOrigin = h.get("origin") || h.get("referer");
  if (!isOriginAllowed(requestOrigin, allowed)) {
    return { error: "Requête invalide (origin)." };
  }

  // ---- CSRF (double-submit) ----
  const csrfBodyRaw = formData.get("csrf")?.toString().trim() || "";
  const csrfBodyToken = csrfBodyRaw.split(":")[0] || csrfBodyRaw;
  const csrfCookieRaw = (await cookies()).get("csrf")?.value || "";
  const csrfCookieToken = csrfCookieRaw.split(":")[0] || csrfCookieRaw;
  if (!csrfBodyToken || !csrfCookieToken || csrfBodyToken !== csrfCookieToken) {
    log.warn("auth.signup.csrf_mismatch", {
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

  // ---- VALIDATION SERVEUR ----
  if (password.length < 6) {
    return { error: "Mot de passe trop court (minimum 6 caractères)." };
  }

  // ---- RATE LIMIT ----
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  let rlIpKey: string;
  let rlAcctKey: string;
  try {
    rlIpKey = rlKey("signup:ip", ip);
    rlAcctKey = rlKey("signup:acct", email.toLowerCase(), ip);
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    log.error("auth.signup.rlkey_error", { error: errorMessage });
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

  // ---- CREATE + (éventuel) AUTO-LOGIN ----
  const supabase = await actionClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    await new Promise((r) => setTimeout(r, 300));
    return { error: "Impossible de créer le compte. Essaie un autre email." };
  }

  if (data?.session) {
    redirect(next);
  }

  const { error: signinError } = await supabase.auth.signInWithPassword({ email, password });
  if (signinError) {
    return {
      error:
        "Compte créé mais connexion impossible (vérifie la config Supabase: désactive la confirmation email).",
    };
  }

  redirect(next);
}
