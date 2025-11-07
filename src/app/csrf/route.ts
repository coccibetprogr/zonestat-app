// src/app/csrf/route.ts
"use server";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";

function generateToken() {
  return randomBytes(16).toString("hex");
}

function detectHttps(request: Request) {
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded) return forwarded.toLowerCase().startsWith("https");
  const url = new URL(request.url);
  return url.protocol === "https:";
}

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const existing = cookieStore.get("csrf")?.value;
  const value = existing || `${generateToken()}:${Date.now()}`;
  const isHttps = detectHttps(request);

  const response = NextResponse.json(
    { csrf: value, has: true, refreshed: !existing },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
  );

  response.cookies.set("csrf", value, {
    httpOnly: false,
    secure: isHttps,
    sameSite: isHttps ? "strict" : "lax",
    path: "/",
    maxAge: 60 * 60,
  });

  return response;
}
