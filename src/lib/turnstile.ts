// src/lib/turnstile.ts
import { log } from "@/utils/observability/log";

type VerifyResponse = {
  success: boolean;
  "error-codes"?: string[];
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  cdata?: string;
};

const IS_PROD = process.env.NODE_ENV === "production";
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile(
  token: string | null | undefined,
  opts?: { ip?: string | null }
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  // En production : configuration obligatoire + token requis (fail-closed)
  if (IS_PROD) {
    if (!siteKey) {
      log.error("turnstile.missing_site_key_in_prod");
      return false;
    }
    if (!secret) {
      log.error("turnstile.missing_secret_in_prod");
      return false;
    }
    if (!token) {
      log.warn("turnstile.missing_token", { ip: opts?.ip || null });
      return false;
    }
  } else {
    // En dev/test : DX → si non configuré, on bypass
    if (!secret || !token || !siteKey) {
      log.debug("turnstile.dev_bypass", { hasSecret: !!secret, hasToken: !!token, hasSiteKey: !!siteKey });
      return true;
    }
  }

  try {
    const body = new URLSearchParams({
      secret: secret as string,
      response: token || "",
    });
    if (opts?.ip) body.set("remoteip", String(opts.ip));

    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });

    if (!res.ok) {
      log.warn("turnstile.http_error", { status: res.status });
      return false;
    }

    const data = (await res.json()) as VerifyResponse;

    if (!data.success) {
      log.warn("turnstile.verify_fail", { errors: data["error-codes"] || [] });
      return false;
    }

    // Optionnel : filtrer le hostname retourné
    const allowedCsv = process.env.ALLOWED_TURNSTILE_HOSTNAMES;
    if (allowedCsv && data.hostname) {
      const allowed = new Set(allowedCsv.split(",").map((s) => s.trim()).filter(Boolean));
      if (!allowed.has(data.hostname)) {
        log.warn("turnstile.hostname_not_allowed", { got: data.hostname });
        return false;
      }
    }

    return true;
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    log.error("turnstile.exception", { error: errorMessage });
    return false;
  }
}
