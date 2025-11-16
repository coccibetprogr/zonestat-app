// src/app/auth/forgot/actions.ts
"use server";

import crypto from "node:crypto";
import { z } from "zod";
import { headers, cookies } from "next/headers";
import { actionClient } from "@/utils/supabase/action";
import { rateLimit } from "@/utils/rateLimit";
import {
  getAllowedOriginsFromHeaders,
  isOriginAllowed,
} from "@/utils/security/origin";
import { verifyTurnstile } from "@/lib/turnstile";
import { log } from "@/utils/observability/log";

export type ForgotState = {
  ok?: boolean;
  error?: string;
};

function readCsrfFromCookie(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const token = raw.split(":")[0]?.trim();
  return token || null;
}

function rlKey(kind: "email" | "hash", email: string): string {
  const norm = email.trim().toLowerCase();
  if (kind === "email") return norm;
  return crypto.createHash("sha256").update(norm).digest("hex");
}

const forgotSchema = z.object({
  email: z.string().email(),
  csrf: z.string().min(1),
  turnstile: z.string().optional(),
});

export async function forgotAction(
  _prev: ForgotState,
  formData: FormData,
): Promise<ForgotState> {
  const h = await headers();
  const origin = h.get("origin");
  const referer = h.get("referer") || undefined;

  const allowed = getAllowedOriginsFromHeaders(h);
  if (!origin || !isOriginAllowed(origin, allowed)) {
    log.warn("auth.forgot.invalid_origin", {
      origin,
      referer,
      allowed: Array.from(allowed),
    });
    return { ok: false, error: "Requête invalide." };
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

  // 🔒 Clé de rate-limit basée sur le hash de l’email, plus d’email en clair
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

  const hashedIp = ip ? crypto.createHash("sha256").update(ip).digest("hex") : undefined;
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  const isProd = process.env.NODE_ENV === "production";

  // En dev / test sans Turnstile, on ne bloque pas sur le captcha
  if (siteKey && secret && isProd) {
    if (!turnstile) {
      log.warn("auth.forgot.turnstile_missing", {
        emailHash,
        ipHash: hashedIp,
      });
      return {
        ok: false,
        error: "Captcha manquant.",
      };
    }

    const captchaToken = typeof turnstile === "string" ? turnstile.trim() : "";

    if (!captchaToken) {
      log.warn("auth.forgot.turnstile_missing", {
        emailHash,
        ipHash: hashedIp,
      });
      return {
        ok: false,
        error: "Captcha manquant.",
      };
    }

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
        error: error.message,
      });
      return { ok: true };
    }

    log.info("auth.forgot.reset_sent", { email_hash: emailHash });
  } catch (err: unknown) {
    log.error("auth.forgot.server_send_error", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return { ok: true };
}
