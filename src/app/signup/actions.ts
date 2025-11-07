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

export type SignupState = { error?: string; success?: string };

function rlKey(...parts: string[]) {
  const secret = process.env.RL_KEY_SECRET || "dev-only";
  const h = crypto.createHash("sha256");
  h.update([secret, ...parts].join("|"));
  return h.digest("hex").slice(0, 48);
}

export async function signupAction(_prev: SignupState, formData: FormData): Promise<SignupState> {
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
    log.warn("auth.signup.csrf_mismatch", {
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

  // ---- VALIDATION SERVEUR ----
  if (password.length < 10) {
    return { error: "Mot de passe trop court (minimum 10 caractères)." };
  }

  // ---- RATE LIMIT ----
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  const rlIp = await rateLimit(rlKey("signup:ip", ip));
  if (!rlIp.ok) return { error: "Trop de tentatives. Réessaie plus tard." };
  const rlAcct = await rateLimit(rlKey("signup:acct", email.toLowerCase(), ip));
  if (!rlAcct.ok) return { error: "Trop de tentatives. Réessaie plus tard." };

  // ---- TURNSTILE TOUJOURS APPELÉ ----
  const okCaptcha = await verifyTurnstile(captcha, { ip });
  if (!okCaptcha) {
    return { error: "Vérification anti-bot échouée. Réessaie." };
  }

  // ---- CREATE + (éventuel) AUTO-LOGIN ----
  const supabase = await actionClient(); // cookies mutables
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
