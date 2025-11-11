// src/app/auth/forgot/actions.ts
"use server";

import { headers, cookies } from "next/headers";
import { actionClient } from "@/utils/supabase/action";
import { rateLimit } from "@/utils/rateLimit";
import { verifyTurnstile } from "@/lib/turnstile";
import { getAllowedOriginsFromHeaders, isOriginAllowed } from "@/utils/security/origin";
import { log } from "@/utils/observability/log";
import crypto from "node:crypto";
import { z } from "zod";

export type ForgotState = {
  ok?: boolean;
  error?: string;
};

const forgotSchema = z.object({
  email: z.string().trim().email("Adresse email invalide."),
  csrf: z.string().trim().min(8, "Jeton CSRF manquant."),
  turnstile: z.string().trim().optional(),
});

function decodeMaybe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
function tokenOnly(raw: string): string {
  const decoded = decodeMaybe(raw || "");
  return (decoded.split(":")[0] || "").trim();
}

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

export async function forgotAction(_prev: unknown, formData: FormData): Promise<ForgotState> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const csrfRaw = String(formData.get("csrf") || "").trim();
  const tsRaw = formData.get("cf-turnstile-response");
  const turnstile = typeof tsRaw === "string" ? tsRaw.trim() : undefined;

  const parsed = forgotSchema.safeParse({ email, csrf: csrfRaw, turnstile });
  if (!parsed.success) return { ok: false, error: "Données invalides." };

  const h = await headers();

  // ---- ORIGIN CHECK (helper centralisé) ----
  const allowed = getAllowedOriginsFromHeaders(h);
  const reqOrigin = h.get("origin") || h.get("referer");
  if (!isOriginAllowed(reqOrigin, allowed)) {
    return { ok: false, error: "Requête invalide (Origin)." };
  }

  // ---- CSRF (double-submit): cookies() fiable en Server Action ----
  const jar = await cookies();
  const csrfCookieRaw = jar.get("csrf")?.value || "";
  const cookieToken = tokenOnly(csrfCookieRaw);
  const bodyToken = tokenOnly(csrfRaw);

  if (!cookieToken || !bodyToken || cookieToken !== bodyToken) {
    log.warn("auth.forgot.csrf_mismatch", {
      hasBody: Boolean(bodyToken),
      hasCookie: Boolean(cookieToken),
      same: cookieToken === bodyToken,
    });
    return { ok: false, error: "Requête invalide (CSRF)." };
  }

  // ---- Rate limit (HMAC, pas de PII en clair) ----
  const ip =
    h.get("x-real-ip") ||
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "127.0.0.1";
  let ipKey: string, acctKey: string;
  try {
    ipKey = rlKey("forgot:ip", ip);
    acctKey = rlKey("forgot:acct", email);
  } catch (e: any) {
    log.error("auth.forgot.rlkey_error", { error: e?.message || String(e) });
    return { ok: false, error: "Service temporairement indisponible." };
  }
  const rlIp = await rateLimit(ipKey);
  if (!rlIp.ok) return { ok: false, error: "Trop de tentatives, réessaie plus tard." };
  const rlAcct = await rateLimit(acctKey);
  if (!rlAcct.ok) return { ok: false, error: "Trop de tentatives, réessaie plus tard." };

  // ---- Turnstile (⚠️ prod seulement, comme la page) ----
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  const secret =
    process.env.TURNSTILE_SECRET_KEY?.trim() ||
    process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY?.trim();

  const captchaRequired =
    process.env.NODE_ENV === "production" && Boolean(siteKey && secret);

  if (captchaRequired) {
    if (!turnstile) {
      return { ok: false, error: "Captcha manquant." };
    }
    const captchaOk = await verifyTurnstile(turnstile, { ip });
    if (!captchaOk) {
      return { ok: false, error: "Vérification anti-bot échouée." };
    }
  }

  // === ENVOI RÉEL DE L’EMAIL CÔTÉ SERVEUR ===
  try {
    const computedOrigin =
      (reqOrigin && (() => { try { return new URL(String(reqOrigin)).origin; } catch { return null; } })()) ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "http://localhost:3000";
    const originSafe = new URL(computedOrigin).origin.replace(/\/+$/, "");

    const supabase = await actionClient(); // anon client côté serveur (cookies mutables)
    const { error: supaErr } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${originSafe}/auth/update-password`,
    });

    if (supaErr) {
      log.warn("auth.forgot.supabase_reset_error", {
        code: (supaErr as any)?.status || (supaErr as any)?.code,
        message: (supaErr as any)?.message || String(supaErr),
      });
    } else {
      log.info?.("auth.forgot.reset_sent", { email_hash: rlKey("hash", email) });
    }
  } catch (err: any) {
    log.error("auth.forgot.server_send_error", {
      error: err?.message || String(err),
    });
    // on ne casse pas l’UX : anti-énumération
  }

  // Toujours message générique côté client
  return { ok: true };
}
