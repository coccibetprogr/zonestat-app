import { NextResponse, NextRequest } from "next/server";

const IS_PROD = process.env.NODE_ENV === "production";

/** Génère un nonce sécurisé par requête pour CSP */
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

/** CSP durcie (avec nonce dynamique, Stripe, Turnstile, Supabase) */
function buildCSP(nonce: string) {
  const directives = [
    "default-src 'self'",
    [
      "script-src",
      `'self'`,
      `'nonce-${nonce}'`,
      "https://challenges.cloudflare.com",
      "https://js.stripe.com",
    ].join(" "),
    [
      "connect-src",
      "'self'",
      "https://*.supabase.co",
      "wss://*.supabase.co",
      "https://api.stripe.com",
      "https://challenges.cloudflare.com",
    ].join(" "),
    ["img-src", "'self'", "data:", "blob:", "https://*.supabase.co"].join(" "),
    ["style-src", "'self'", "'unsafe-inline'"].join(" "), // pour Tailwind/Next
    ["font-src", "'self'", "data:"].join(" "),
    [
      "frame-src",
      "'self'",
      "https://challenges.cloudflare.com",
      "https://js.stripe.com",
      "https://checkout.stripe.com",
      "https://billing.stripe.com",
    ].join(" "),
    ["object-src", "'none'"].join(" "),
    ["frame-ancestors", "'none'"].join(" "),
    [
      "form-action",
      "'self'",
      "https://challenges.cloudflare.com",
      "https://checkout.stripe.com",
      "https://billing.stripe.com",
    ].join(" "),
    "upgrade-insecure-requests",
    ["base-uri", "'self'"].join(" "),
  ];
  return directives.join("; ");
}

/** Ajout des en-têtes de sécurité globaux */
function applySecurityHeaders(_req: NextRequest, res: NextResponse, nonce: string) {
  res.headers.set("Content-Security-Policy", buildCSP(nonce));
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set(
    "Permissions-Policy",
    [
      "accelerometer=()",
      "ambient-light-sensor=()",
      "autoplay=()",
      "battery=()",
      "camera=()",
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
      "usb=()",
      "vr=()",
      "xr-spatial-tracking=()",
    ].join(", "),
  );
  if (IS_PROD) {
    res.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload",
    );
  }
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  res.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  res.headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  res.headers.set("Origin-Agent-Cluster", "?1");

  // Marqueur debug (curl)
  res.headers.set("X-Middleware-Active", "1");

  // ✅ Injection du nonce dans la réponse (utilisable par les scripts inline)
  res.headers.set("x-csp-nonce", nonce);

  return res;
}

/** --- CSRF cookie (double-submit) --- */
function makeRandomHex(nBytes = 16) {
  const bytes = new Uint8Array(nBytes);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

type ParsedCsrf = { token: string; ts: number } | null;
function parseCsrfCookieVal(val: string | undefined): ParsedCsrf {
  if (!val) return null;
  const s = String(val);
  const i = s.indexOf(":");
  if (i === -1) return { token: s, ts: 0 };
  const tok = s.slice(0, i);
  const ts = Number.parseInt(s.slice(i + 1), 10);
  if (!tok || Number.isNaN(ts)) return null;
  return { token: tok, ts };
}

function stampCsrf(res: NextResponse, req: NextRequest) {
  const raw = req.cookies.get("csrf")?.value;
  const parsed = parseCsrfCookieVal(raw);
  const now = Date.now();
  const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

  let token: string;
  let ts: number;

  if (!parsed) {
    token = makeRandomHex(16);
    ts = now;
  } else {
    token = parsed.token || makeRandomHex(16);
    ts = parsed.ts > 0 ? parsed.ts : now;
    if (now - ts > SIX_HOURS_MS) ts = now;
  }

  const stamped = `${token}:${ts}`;
  const proto = req.headers.get("x-forwarded-proto") || req.nextUrl.protocol || "http";
  const isHttps = String(proto).toLowerCase().startsWith("https");

  res.cookies.set("csrf", stamped, {
    httpOnly: false, // double-submit (lisible client)
    secure: isHttps,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(6 * 60 * 60),
  });

  return res;
}

/** Middleware global : CSRF + CSP + headers sécurité */
export function middleware(req: NextRequest) {
  const nonce = generateNonce();
  let res = NextResponse.next();
  res = stampCsrf(res, req);
  res = applySecurityHeaders(req, res, nonce);
  return res;
}

/** Matcher large compatible App Router */
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
