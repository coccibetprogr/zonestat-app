// src/app/auth/update-password/actions.ts
"use server";

import { headers, cookies } from "next/headers";

export type UpdatePwGateState = { ok?: boolean; error?: string };

async function verifyTurnstile(
  responseToken?: string,
  remoteIp?: string | null
): Promise<boolean> {
  const secret =
    process.env.TURNSTILE_SECRET_KEY ||
    process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;
  if (!secret) return true;         // bypass si pas de secret
  if (!responseToken) return false;

  try {
    const body = new URLSearchParams();
    body.set("secret", secret);
    body.set("response", responseToken);
    if (remoteIp) body.set("remoteip", remoteIp);

    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = (await res.json()) as { success?: boolean };
    return !!data.success;
  } catch {
    return false;
  }
}

function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function computeAllowedOrigin(host: string | null, protoHint?: string | null): string | null {
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

export async function updatePasswordGate(
  _prev: UpdatePwGateState | null,
  formData: FormData
): Promise<UpdatePwGateState> {
  const h = await headers();
  const jar = await cookies();

  // Origin allow-list
  const forwardedHost = h.get("x-forwarded-host");
  const host = h.get("host");
  const protoHint = h.get("x-forwarded-proto");
  const inferredOrigin =
    computeAllowedOrigin(forwardedHost, protoHint) ||
    computeAllowedOrigin(host, protoHint);
  const fallbackHostOrigin = computeAllowedOrigin(host, protoHint);
  const envOrigin = (() => {
    const envUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
    if (!envUrl) return null;
    try {
      return new URL(envUrl.replace(/\/+$/, "")).origin;
    } catch {
      return null;
    }
  })();
  const allowed = new Set(
    [envOrigin, inferredOrigin, fallbackHostOrigin].filter(Boolean) as string[]
  );
  const requestOrigin =
    normalizeOrigin(h.get("origin")) ||
    normalizeOrigin(h.get("referer")) ||
    inferredOrigin ||
    fallbackHostOrigin;
  if (!requestOrigin || !allowed.has(requestOrigin)) {
    return { error: "Requête invalide (origin)." };
  }

  // CSRF token-only
  const csrfBodyEntry = formData.get("csrf");
  const csrfBodyToken =
    typeof csrfBodyEntry === "string"
      ? csrfBodyEntry.split(":")[0]?.trim() || ""
      : "";
  const csrfCookieToken = jar.get("csrf")?.value?.split(":")?.[0] || "";
  if (!csrfBodyToken || !csrfCookieToken || csrfBodyToken !== csrfCookieToken) {
    return { error: "Requête invalide (csrf)." };
  }

  // Rate-limit léger (tu peux garder ton implémentation existante ici si tu en as une)
  // …

  // Turnstile : requis UNIQUEMENT si secret + sitekey → widget affiché côté client
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
    const ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("x-real-ip") ||
      null;
    const okCaptcha = await verifyTurnstile(captchaToken, ip);
    if (!okCaptcha) {
      return { error: "Vérification anti-bot échouée. Réessaie." };
    }
  }

  return { ok: true };
}
