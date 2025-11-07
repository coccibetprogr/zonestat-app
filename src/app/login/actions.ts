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
  const secret = process.env.RL_KEY_SECRET || "dev-only";
  const h = crypto.createHash("sha256");
  h.update([secret, ...parts].join("|"));
  return h.digest("hex").slice(0, 48);
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const h = await headers();

  // ---- ORIGIN CHECK ----
  const origin = h.get("origin");
  const host = h.get("host") || "localhost:3000";
  const allowedOrigin =
    process.env.NEXT_PUBLIC_SITE_URL?.trim()
      ? new URL(process.env.NEXT_PUBLIC_SITE_URL).origin
      : `http${host.startsWith("localhost") ? "" : "s"}://${host}`;
  if (!origin || origin !== allowedOrigin) {
    return { error: "Requête invalide (origin)." };
  }

  // ---- CSRF (double-submit) ----
  const csrfBody = formData.get("csrf")?.toString() || "";
  const csrfCookie = (await cookies()).get("csrf")?.value || "";
  if (!csrfBody || !csrfCookie || csrfBody !== csrfCookie) {
    log.warn("auth.login.csrf_mismatch", {
      hasBody: Boolean(csrfBody),
      hasCookie: Boolean(csrfCookie),
      same: csrfBody === csrfCookie,
    });
    return { error: "Requête invalide (csrf)." };
  }

  const next = safeNext(formData.get("next")?.toString());
  const email = formData.get("email")?.toString() || "";
  const password = formData.get("password")?.toString() || "";
  const captcha = formData.get("cf-turnstile-response")?.toString();

  // ---- RATE LIMIT ----
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  const rlIp = await rateLimit(rlKey("login:ip", ip));
  if (!rlIp.ok) return { error: "Trop de tentatives. Réessaie plus tard." };
  const rlAcct = await rateLimit(rlKey("login:acct", email.toLowerCase(), ip));
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
