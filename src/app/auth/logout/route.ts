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

function getAllowedOrigins(req: Request) {
  const origins = new Set<string>();

  const envUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (envUrl) {
    const normalized = normalizeOrigin(envUrl);
    if (normalized) origins.add(normalized);
  }

  // Déduire proto/host du contexte (dev: http + IP LAN OK)
  const host = new URL(req.url).host || "localhost:3000";
  const hdrProto = req.headers.get("x-forwarded-proto");
  const hdrOrigin = req.headers.get("origin") || "";
  const urlProto = new URL(req.url).protocol.replace(":", "");
  const proto = hdrProto || (hdrOrigin.startsWith("https://") ? "https" : urlProto || "http");
  origins.add(`${proto}://${host}`);

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
  const csrfBody = form.get("csrf")?.toString() || "";
  const csrfCookie = (await cookies()).get("csrf")?.value || "";
  if (!csrfBody || !csrfCookie || csrfBody !== csrfCookie) {
    return new NextResponse("Invalid csrf", { status: 403 });
  }

  const supabase = await actionClient();
  await supabase.auth.signOut({ scope: "global" });

  const redirectUrl = new URL("/", req.url);
  return NextResponse.redirect(redirectUrl, { status: 303 });
}
