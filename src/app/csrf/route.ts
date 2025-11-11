// src/app/csrf/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";

export const dynamic = "force-dynamic"; // ⬅️ empêche le cache statique

function generateToken() {
  return randomBytes(16).toString("hex"); // le contenu n’a pas d’importance, on compare juste avant “:”
}

function detectHttps(request: Request) {
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded) return forwarded.toLowerCase().startsWith("https");
  const url = new URL(request.url);
  return url.protocol === "https:";
}

export async function GET(request: Request) {
  const jar = await cookies();
  const existing = jar.get("csrf")?.value;
  const value = existing || `${generateToken()}:${Date.now()}`;
  const isHttps = detectHttps(request);

  const res = NextResponse.json(
    { csrf: value, has: true, refreshed: !existing },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
  );

  // ⚠️ httpOnly:false car on utilise un double-submit token (le client doit le lire)
  // 🔒 SameSite:lax (stable en http/https)
  res.cookies.set("csrf", value, {
    httpOnly: false,
    secure: isHttps,
    sameSite: "lax",
    path: "/",
    maxAge: 6 * 60 * 60, // 6h
  });

  return res;
}
