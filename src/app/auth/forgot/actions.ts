// src/app/auth/forgot/actions.ts
"use server";

import { headers } from "next/headers";
import { rateLimit } from "@/utils/rateLimit";
import { verifyTurnstile } from "@/lib/turnstile";
import { z } from "zod";
import crypto from "node:crypto";
import { log } from "@/utils/observability/log";

export type ForgotState = {
  ok?: boolean;
  error?: string;
  email?: string;
};

const forgotSchema = z.object({
  email: z.string().trim().email("Adresse email invalide."),
  turnstile: z.string().trim().optional(),     // ← optionnel
  csrf: z.string().trim().min(8, "Jeton CSRF manquant."),
});

/** Tolérant au %3A / valeurs encodées */
function decodeMaybe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Extrait uniquement le token (avant :) même si "token%3Ats" ou "token:ts" */
function extractTokenOnly(raw: string): string {
  const decoded = decodeMaybe(raw || "");
  return (decoded.split(":")[0] || "").trim();
}

function rlKey(...parts: string[]) {
  const secret = process.env.RL_KEY_SECRET;
  if (process.env.NODE_ENV === "production" && !secret) {
    log.error?.("rateLimit.missing_rl_key_secret_in_prod");
    throw new Error("Rate limit secret missing in production");
  }
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

export async function forgotAction(
  _prev: unknown,
  formData: FormData
): Promise<ForgotState> {
  // ----------- Lecture & validation input -----------
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const csrfRaw = String(formData.get("csrf") || "").trim();
  const tsRaw = formData.get("cf-turnstile-response");
  const turnstile = typeof tsRaw === "string" ? tsRaw.trim() : undefined;

  const parsed = forgotSchema.safeParse({
    email,
    turnstile,
    csrf: csrfRaw,
  });
  if (!parsed.success) return { ok: false, error: "Données invalides." };

  const h = await headers();

  // ----------- Origin allow-list (env + infer host/proxy) -----------
  const forwardedHost = h.get("x-forwarded-host");
  const host = h.get("host");
  const protoHint = h.get("x-forwarded-proto");

  const infer = (hh: string | null) => {
    if (!hh) return null;
    const name = hh.trim();
    if (!name) return null;
    if (protoHint) return `${protoHint}://${name}`;
    const hostname = name.split(":")[0]?.toLowerCase() || "";
    const isLocal =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.");
    const proto = isLocal ? "http" : "https";
    return `${proto}://${name}`;
  };
  const inferredOrigin = infer(forwardedHost) || infer(host);
  const envOrigin = normalizeOrigin(
    (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "")
  );
  const allowed = new Set([envOrigin, inferredOrigin].filter(Boolean) as string[]);
  const reqOrigin =
    normalizeOrigin(h.get("origin")) ||
    normalizeOrigin(h.get("referer")) ||
    inferredOrigin;

  if (!reqOrigin || !allowed.has(reqOrigin)) {
    return { ok: false, error: "Requête invalide (Origin)." };
  }

  // ----------- Rate-limit (HMAC: pas de PII dans les clés) -----------
  const ip =
    h.get("x-real-ip") ||
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "127.0.0.1";

  let ipKey: string;
  let acctKey: string;
  try {
    ipKey = rlKey("forgot:ip", ip);
    acctKey = rlKey("forgot:acct", email);
  } catch (e: any) {
    log.error?.("auth.forgot.rlkey_error", { error: e?.message || String(e) });
    return { ok: false, error: "Service temporairement indisponible." };
  }

  const rlIp = await rateLimit(ipKey);
  if (!rlIp.ok) return { ok: false, error: "Trop de tentatives, réessaie plus tard." };
  const rlAcct = await rateLimit(acctKey);
  if (!rlAcct.ok) return { ok: false, error: "Trop de tentatives, réessaie plus tard." };

  // ----------- Turnstile (exigé seulement si widget + secret présents) -----------
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  const secret =
    process.env.TURNSTILE_SECRET_KEY?.trim() ||
    process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY?.trim();
  const requireCaptcha = Boolean(siteKey && secret);

  if (requireCaptcha && !turnstile) {
    return { ok: false, error: "Captcha manquant." };
  }
  if (requireCaptcha && turnstile) {
    const ok = await verifyTurnstile(turnstile);
    if (!ok) return { ok: false, error: "Vérification anti-bot échouée." };
  }

  // ----------- CSRF (token-only; tolérant à l'encodage) -----------
  // Extrait la valeur brute du cookie depuis le header Cookie
  // (on reste côté headers() pour éviter un import cookies() supplémentaire ici)
  const cookieRaw =
    h.get("cookie")?.match(/(?:^|;\s*)csrf=([^;]+)/)?.[1] || "";
  const cookieToken = extractTokenOnly(cookieRaw); // ← gère "token%3Ats" / "token:ts" / "token"
  const bodyToken = extractTokenOnly(csrfRaw);

  if (!cookieToken || !bodyToken || cookieToken !== bodyToken) {
    return { ok: false, error: "Requête invalide (CSRF)." };
  }

  // ----------- OK -----------
  return { ok: true, email };
}
