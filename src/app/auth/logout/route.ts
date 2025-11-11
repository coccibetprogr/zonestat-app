// src/app/auth/logout/route.ts
import { NextResponse } from "next/server";
import { actionClient } from "@/utils/supabase/action";
import { cookies } from "next/headers";
import { getAllowedOriginsFromHeaders, isOriginAllowed } from "@/utils/security/origin";

export async function POST(req: Request) {
  // ---- Origin check (helper centralisé) ----
  const allowed = getAllowedOriginsFromHeaders(req.headers);
  if (!isOriginAllowed(req.headers.get("origin"), allowed)) {
    return new NextResponse("Invalid origin", { status: 403 });
  }

  // ---- CSRF double-submit ----
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
