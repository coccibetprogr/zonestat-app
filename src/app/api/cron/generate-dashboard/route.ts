// src/app/api/cron/generate-dashboard/route.ts
import { NextResponse } from "next/server";
import { generateAndStoreDashboardForDate } from "@/services/generateDashboardForDate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Normalise un secret :
 * - trim des espaces
 * - supprime des guillemets autour ("xxx" ou 'xxx')
 */
function normalizeSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  // enlève un éventuel wrapping par guillemets simples/doubles
  const unquoted = trimmed.replace(/^['"](.+)['"]$/, "$1");
  return unquoted || null;
}

export async function POST(req: Request) {
  // Récupération & normalisation du header Authorization
  const authHeaderRaw = req.headers.get("authorization");
  const cronSecretRaw = process.env.CRON_SECRET;

  const cronSecret = normalizeSecret(cronSecretRaw);
  const headerToken = normalizeSecret(
    authHeaderRaw?.toLowerCase().startsWith("bearer ")
      ? authHeaderRaw.slice(7)
      : authHeaderRaw ?? null,
  );

  if (!cronSecret || !headerToken || headerToken !== cronSecret) {
    // Petit log côté serveur (n’apparaît pas au client)
    console.warn("[cron/generate-dashboard] Unauthorized call", {
      hasCronSecret: Boolean(cronSecretRaw),
      hasAuthHeader: Boolean(authHeaderRaw),
    });

    return new NextResponse("Unauthorized", {
      status: 401,
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
    });
  }

  // Par défaut : date du jour (UTC)
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD

  try {
    const payload = await generateAndStoreDashboardForDate(dateStr);

    return NextResponse.json(
      {
        ok: true,
        date: dateStr,
        matchCount: payload.matches.length,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[cron/generate-dashboard] error", error);

    return NextResponse.json(
      {
        ok: false,
        date: dateStr,
        error: "generation_failed",
      },
      { status: 500 },
    );
  }
}
