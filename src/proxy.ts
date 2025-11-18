// src/proxy.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const CSRF_COOKIE_NAME = "csrf";
const CSRF_TTL_MS = 1000 * 60 * 60 * 6;
const CSRF_TTL_SECONDS = CSRF_TTL_MS / 1000;

const PERMISSIONS_POLICY = [
  "accelerometer=()",
  "ambient-light-sensor=()",
  "autoplay=()",
  "battery=()",
  "camera=()",
  "clipboard-read=()",
  "clipboard-write=()",
  "display-capture=()",
  "document-domain=()",
  "encrypted-media=()",
  "fullscreen=()",
  "geolocation=()",
  "gyroscope=()",
  "magnetometer=()",
  "microphone=()",
  "midi=()",
  "payment=()",
  "picture-in-picture=()",
  "publickey-credentials-get=()",
  "screen-wake-lock=()",
  "sync-xhr=()",
  "usb=()",
  "web-share=()",
  "xr-spatial-tracking=()",
].join(", ");

// -----------------------------
// 🔍 Détection simple de session (UX hint, PAS sécurité)
// -----------------------------
function isUserLogged(req: NextRequest): boolean {
  const cookieNames = req.cookies.getAll().map((c) => c.name);

  // Cookie Supabase typique : sb_xxx_auth-token
  const authCookie = cookieNames.find(
    (name) => name.includes("sb") && name.includes("auth-token"),
  );

  return Boolean(authCookie);
}

export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const loggedIn = isUserLogged(req);

  // -------------------------
  // 🔒 1) Redirections auth (UX)
  // -------------------------
  // ⚠️ Ceci n'est qu'un garde UX.
  // La vraie protection est dans les pages server (supabase.auth.getUser + RLS).

  const protectedPrefixes = ["/account", "/pricing"];

  // User NON connecté → pas le droit d'aller sur /account, /account/... ou /pricing, /pricing/...
  if (
    !loggedIn &&
    protectedPrefixes.some(
      (prefix) => path === prefix || path.startsWith(prefix + "/"),
    )
  ) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  // On NE bloque plus /login /signup ici
  // → ces pages gèrent elles-mêmes la redirection si l'utilisateur est déjà connecté.

  // -------------------------
  // 2) Ping interne
  // -------------------------
  if (req.nextUrl.pathname === "/__mw-ping") {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "x-middleware-active": "1",
        "x-zonestat-ip": getClientIp(req) ?? "unknown",
      },
    });
  }

  // -------------------------
  // 3) CSP + sécurité
  // -------------------------
  const nonce = generateNonce();
  const isProd = process.env.NODE_ENV === "production";
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-csp-nonce", nonce);

  const res = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  ensureCsrfCookie(req, res, isSecureRequest(req));
  applySecurityHeaders(res, nonce, isProd);

  res.headers.set("x-zonestat-ip", getClientIp(req) ?? "unknown");
  res.headers.set("x-csp-nonce", nonce);
  res.headers.set("x-middleware-active", "1");

  return res;
}

// -------------------------
// Utilities existants
// -------------------------

function generateNonce(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com https://js.stripe.com`,
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://challenges.cloudflare.com https://*.upstash.io wss://*.upstash.io",
    "img-src 'self' data: blob: https://*.supabase.co",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "frame-src 'self' https://challenges.cloudflare.com https://js.stripe.com https://checkout.stripe.com https://billing.stripe.com",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self' https://challenges.cloudflare.com https://checkout.stripe.com https://billing.stripe.com",
    "upgrade-insecure-requests",
    "base-uri 'self'",
  ].join("; ");
}

function ensureCsrfCookie(
  req: NextRequest,
  res: NextResponse,
  secure: boolean,
) {
  const now = Date.now();
  const existing = parseCsrfCookie(req.cookies.get(CSRF_COOKIE_NAME)?.value);

  let token: string;
  let issuedAt: number;

  if (existing && now - existing.timestamp < CSRF_TTL_MS) {
    token = existing.token;
    issuedAt = existing.timestamp;
  } else {
    token = generateRandomToken();
    issuedAt = now;
  }

  const value = `${token}:${issuedAt}`;

  res.cookies.set({
    name: CSRF_COOKIE_NAME,
    value,
    httpOnly: false,
    sameSite: "lax",
    secure,
    maxAge: CSRF_TTL_SECONDS,
    path: "/",
  });
}

type ParsedCsrfCookie = { token: string; timestamp: number };

function parseCsrfCookie(value?: string | null): ParsedCsrfCookie | null {
  if (!value) return null;
  const [token, timestamp] = value.split(":");
  const parsedTimestamp = Number(timestamp);
  if (!token || Number.isNaN(parsedTimestamp)) {
    return null;
  }
  return { token, timestamp: parsedTimestamp };
}

function generateRandomToken(bytesLength = 32): string {
  const bytes = new Uint8Array(bytesLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function applySecurityHeaders(
  res: NextResponse,
  nonce: string,
  isProd: boolean,
) {
  res.headers.set("Content-Security-Policy", buildCsp(nonce));
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Permissions-Policy", PERMISSIONS_POLICY);
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  res.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  res.headers.set("Origin-Agent-Cluster", "?1");

  if (isProd) {
    res.headers.set("Cross-Origin-Embedder-Policy", "require-corp");
    res.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload",
    );
  }
}

function isSecureRequest(req: NextRequest): boolean {
  const protoHeader = req.headers.get("x-forwarded-proto");
  if (protoHeader) {
    const proto = protoHeader.split(",")[0]?.trim().toLowerCase();
    if (proto) {
      return proto === "https";
    }
  }
  return req.nextUrl.protocol === "https:";
}

function getClientIp(req: NextRequest): string | null {
  const headerOrder = [
    "x-vercel-ip",
    "cf-connecting-ip",
    "x-real-ip",
    "x-forwarded-for",
  ];

  for (const headerName of headerOrder) {
    const value = req.headers.get(headerName);
    if (!value) continue;

    if (headerName === "x-forwarded-for") {
      const ip = value
        .split(",")
        .map((part) => part.trim())
        .find(Boolean);
      if (ip) return ip;
    } else {
      return value;
    }
  }

  return null;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
