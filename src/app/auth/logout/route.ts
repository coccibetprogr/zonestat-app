// src/app/auth/logout/route.ts
import { NextResponse } from "next/server";
import { actionClient } from "@/utils/supabase/action";
import { cookies } from "next/headers";

function normalizeOrigin(value: string) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

function computeAllowedOrigin(host: string | null, protoHint?: string | null) {
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

function getAllowedOrigins(req: Request) {
  const origins = new Set<string>();

  const envUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (envUrl) {
    const normalized = normalizeOrigin(envUrl);
    if (normalized) origins.add(normalized);
  }

  // Déduire proto/host du contexte (dev: http + IP LAN OK)
  const hdrProto = req.headers.get("x-forwarded-proto");
  const forwardedHost = req.headers.get("x-forwarded-host");
  const fromForwarded = computeAllowedOrigin(forwardedHost, hdrProto);
  if (fromForwarded) origins.add(fromForwarded);
  const urlHost = new URL(req.url).host || null;
  const fromUrl = computeAllowedOrigin(urlHost, hdrProto);
  if (fromUrl) origins.add(fromUrl);

  return origins;
}

function isOriginAllowed(origin: string, allowed: Set<string>) {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  for (const candidate of allowed) {
    const normalizedCandidate = normalizeOrigin(candidate);
    if (normalizedCandidate === normalized) return true;
  }
  return false;
}

export async function POST(req: Request) {
  // Origin check (anti-CSRF moderne)
  const origin = req.headers.get("origin");
  const allowedOrigins = getAllowedOrigins(req);
  if (!origin || !isOriginAllowed(origin, allowedOrigins)) {
    return new NextResponse("Invalid origin", { status: 403 });
  }

  // CSRF double-submit
  const form = await req.formData();
  const csrfBodyRaw = form.get("csrf")?.toString().trim() || "";
  const csrfBodyToken = csrfBodyRaw.split(":")[0] || csrfBodyRaw;
  const csrfCookieRaw = (await cookies()).get("csrf")?.value || "";
  const csrfCookieToken = csrfCookieRaw.split(":")[0] || csrfCookieRaw;
  if (!csrfBodyToken || !csrfCookieToken || csrfBodyToken !== csrfCookieToken) {
    return new NextResponse("Invalid csrf", { status: 403 });
  }

  const supabase = await actionClient();
  await supabase.auth.signOut({ scope: "global" });

  const redirectUrl = new URL("/", req.url);
  return NextResponse.redirect(redirectUrl, { status: 303 });
}
