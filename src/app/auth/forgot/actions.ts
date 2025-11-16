// src/app/auth/forgot/actions.ts
"use server";

import { cookies, headers } from "next/headers";
import { z } from "zod";
import { rateLimit } from "@/utils/rateLimit";
import { log } from "@/utils/observability/log";
import crypto from "node:crypto";
import { actionClient } from "@/utils/supabase/action";
import { verifyTurnstile } from "@/lib/turnstile";

const forgotSchema = z.object({
  email: z.string().email(),
  csrf: z.string().min(10),
  turnstile: z.string().optional(),
});

export type ForgotState =
  | { ok: true; message: string }
  | { ok: false; error: string };

function readCsrfFromCookie(raw: string | null): string | null {
  if (!raw) return null;
  const [token] = raw.split(":");
  return token || null;
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

export async function forgotAction(
  _prevState: ForgotState | null,
  formData: FormData,
): Promise<ForgotState> {
  const h = await headers();

  // ---- Origin check (CSRF bandeau) ----
  const origin = h.get("origin") || "";
  const host = h.get("host") || "";
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (!site) {
    log.error("auth.forgot.missing_site_url_env");
    return { ok: false, error: "Configuration serveur invalide (site_url)." };
  }
  const allowedOrigin = new URL(site).origin;
  const derivedOrigin = `https://${host}`;

  if (origin !== allowedOrigin && origin !== derivedOrigin) {
    log.warn("auth.forgot.invalid_origin", {
      origin,
      allowedOrigin,
      derivedOrigin,
    });
    return { ok: false, error: "Origine de la requête invalide." };
  }

  const rawEmail = formData.get("email");
  const rawCsrf = formData.get("csrf");

  const parsed = forgotSchema.safeParse({
    email: typeof rawEmail === "string" ? rawEmail : "",
    csrf: typeof rawCsrf === "string" ? rawCsrf : "",
    turnstile:
      typeof formData.get("cf-turnstile-response") === "string"
        ? (formData.get("cf-turnstile-response") as string)
        : undefined,
  });

  if (!parsed.success) {
    log.warn("auth.forgot.invalid_payload", {
      issues: parsed.error.flatten(),
    });
    return { ok: false, error: "Données invalides." };
  }

  const { email, csrf, turnstile } = parsed.data;
  const emailHash = rlKey("hash", email);

  const cookieStore = await cookies();
  const cookieCsrfRaw = cookieStore.get("csrf")?.value || null;
  const cookieCsrf = readCsrfFromCookie(cookieCsrfRaw);

  if (!cookieCsrf || cookieCsrf !== csrf) {
    log.warn("auth.forgot.csrf_mismatch", {
      emailHash,
      hasCookie: Boolean(cookieCsrfRaw),
    });
    return { ok: false, error: "Requête CSRF invalide." };
  }

  // 🔒 Rate limit sur mail HASHÉ (plus d’email en clair)
  const rl = await rateLimit(`forgot:${emailHash}`, {
    limit: 5,
    window: "1 h",
  });

  if (!rl.ok) {
    log.warn("auth.forgot.ratelimit_blocked", {
      emailHash,
      limit: rl.limit,
      remaining: rl.remaining,
      reason: rl.reason,
    });
    return {
      ok: false,
      error: "Trop de tentatives. Réessaie plus tard.",
    };
  }

  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("cf-connecting-ip") ||
    undefined;

  const hashedIp = ip
    ? crypto.createHash("sha256").update(ip).digest("hex")
    : undefined;
  const isProd = process.env.NODE_ENV === "production";

  // ---- TURNSTILE ----
  const captchaToken = typeof turnstile === "string" ? turnstile.trim() : "";

  if (isProd && !captchaToken) {
    log.warn("auth.forgot.turnstile_missing", {
      emailHash,
      ipHash: hashedIp,
    });
    return {
      ok: false,
      error: "Captcha manquant.",
    };
  }

  if (captchaToken) {
    const captchaOk = await verifyTurnstile(captchaToken, { ip });

    if (!captchaOk) {
      log.warn("auth.forgot.turnstile_failed", {
        emailHash,
        ipHash: hashedIp,
      });

      return {
        ok: false,
        error: "Vérification anti-bot échouée. Merci de réessayer.",
      };
    }
  }

  try {
    const supabase = await actionClient();
    const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL}/auth/update-password`;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (error) {
      log.error("auth.forgot.supabase_error", {
        emailHash,
        code: error.code,
        message: error.message,
      });

      return {
        ok: false,
        error: "Impossible d’envoyer le lien. Réessaie plus tard.",
      };
    }

    log.info("auth.forgot.reset_sent", {
      emailHash,
      ipHash: hashedIp,
    });

    return {
      ok: true,
      message:
        "Si un compte existe avec cet email, un lien de réinitialisation a été envoyé.",
    };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    log.error("auth.forgot.server_send_error", {
      emailHash,
      ipHash: hashedIp,
      error: message,
    });

    return {
      ok: false,
      error: "Erreur serveur. Réessaie plus tard.",
    };
  }
}
