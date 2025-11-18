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

export async function updatePasswordGate(_prev: UpdatePwGateState | null, formData: FormData): Promise<UpdatePwGateState> {
  const h = await headers();

  // ---- Origin check (helper commun) ----
  const allowedOrigins = getAllowedOriginsFromHeaders(h);
  const origin = h.get("origin");
  if (!isOriginAllowed(origin, allowedOrigins)) {
    log.warn("auth.updatepw.invalid_origin", {
      origin,
      allowedOrigins,
    });
    return { error: "Origine de la requête invalide." };
  }

  // ---- RATE LIMIT ----
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown";

  let rlIpKey: string;
  try {
    rlIpKey = rlKey("updatepw:ip", ip);
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    log.error("auth.updatepw.rlkey_error", { error: errorMessage });
    return { error: "Erreur serveur (config). Contacte l’administrateur." };
  }

  const rl = await rateLimit(rlIpKey, { limit: 5, window: "10 m" });
  if (!rl.ok) {
    log.warn("auth.updatepw.ratelimit_blocked", {
      ipHash: crypto.createHash("sha256").update(ip).digest("hex"),
      limit: rl.limit,
      remaining: rl.remaining,
      reason: rl.reason,
    });
    return { error: "Trop de tentatives. Réessaie plus tard." };
  }

  // ---- CSRF (double-submit) ----
  const csrfBodyRaw = formData.get("csrf")?.toString().trim() || "";
  const csrfBodyToken = csrfBodyRaw.split(":")[0] || csrfBodyRaw;
  const csrfCookieRaw = (await cookies()).get("csrf")?.value || "";
  const csrfCookieToken = csrfCookieRaw.split(":")[0] || csrfCookieRaw;
  if (!csrfBodyToken || !csrfCookieToken || csrfBodyToken !== csrfCookieToken) {
    log.warn("auth.updatepw.csrf_mismatch", {
      hasBody: Boolean(csrfBodyToken),
      hasCookie: Boolean(csrfCookieToken),
      same: csrfBodyToken === csrfCookieToken,
    });
    return { error: "Requête invalide (csrf)." };
  }

  // ---- TURNSTILE ----
  const cfToken = formData.get("cf-turnstile-response");
  const captchaToken = typeof cfToken === "string" ? cfToken.trim() : "";
  const isProd = process.env.NODE_ENV === "production";

  if (isProd && !captchaToken) {
    log.warn("auth.updatepw.turnstile_missing", {
      ipHash: crypto.createHash("sha256").update(ip).digest("hex"),
    });
    return { error: "Captcha manquant." };
  }

  if (captchaToken) {
    const okCaptcha = await verifyTurnstile(captchaToken, { ip });
    if (!okCaptcha) {
      log.warn("auth.updatepw.turnstile_failed", {
        ipHash: crypto.createHash("sha256").update(ip).digest("hex"),
      });
      return { error: "Vérification anti-bot échouée. Réessaie." };
    }
  }

  return { ok: true };
}
