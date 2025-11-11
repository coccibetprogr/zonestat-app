// src/app/auth/update-password/actions.ts
"use server";

import { headers, cookies } from "next/headers";
import { getAllowedOriginsFromHeaders, isOriginAllowed } from "@/utils/security/origin";
import { rateLimit } from "@/utils/rateLimit";
import { log } from "@/utils/observability/log";
import crypto from "node:crypto";
import { verifyTurnstile } from "@/lib/turnstile";

export type UpdatePwGateState = { ok?: boolean; error?: string };

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

export async function updatePasswordGate(
  _prev: UpdatePwGateState | null,
  formData: FormData
): Promise<UpdatePwGateState> {
  const h = await headers();
  const jar = await cookies();

  // ---- ORIGIN CHECK (helper centralisé) ----
  const allowed = getAllowedOriginsFromHeaders(h);
  const requestOrigin = h.get("origin") || h.get("referer");
  if (!isOriginAllowed(requestOrigin, allowed)) {
    return { error: "Requête invalide (origin)." };
  }

  // ---- CSRF token-only ----
  const csrfBodyEntry = formData.get("csrf");
  const csrfBodyToken =
    typeof csrfBodyEntry === "string"
      ? csrfBodyEntry.split(":")[0]?.trim() || ""
      : "";
  const csrfCookieToken = jar.get("csrf")?.value?.split(":")?.[0] || "";
  if (!csrfBodyToken || !csrfCookieToken || csrfBodyToken !== csrfCookieToken) {
    return { error: "Requête invalide (csrf)." };
  }

  // ---- RATE LIMIT (HMAC; IP + compte/email si présent) ----
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown";

  let keyIp: string, keyAcct: string;
  try {
    const email = (formData.get("email") || "").toString().toLowerCase();
    keyIp = rlKey("updatepw:ip", ip);
    keyAcct = rlKey("updatepw:acct", email || ip);
  } catch (e: any) {
    log.error("auth.updatepw.rlkey_error", { error: e?.message || String(e) });
    return { error: "Service temporairement indisponible." };
  }

  const rlA = await rateLimit(keyIp);
  const rlB = await rateLimit(keyAcct);
  if (!rlA.ok || !rlB.ok) {
    log.warn("auth.updatepw.rate_limited", { ip });
    return { error: "Trop de tentatives. Réessaie plus tard." };
  }

  // ---- Turnstile requis uniquement si secret + sitekey présents ----
  const secret =
    process.env.TURNSTILE_SECRET_KEY ||
    process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY ||
    "";
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  const captchaRequired = Boolean(secret && siteKey);
  const cfTokenEntry = formData.get("cf-turnstile-response");
  const captchaToken = typeof cfTokenEntry === "string" ? cfTokenEntry.trim() : "";

  if (captchaRequired && !captchaToken) {
    return { error: "Captcha manquant." };
  }
  if (captchaRequired && captchaToken) {
    const okCaptcha = await verifyTurnstile(captchaToken, { ip });
    if (!okCaptcha) {
      return { error: "Vérification anti-bot échouée. Réessaie." };
    }
  }

  return { ok: true };
}
