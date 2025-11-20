// src/app/api/cron/generate-dashboard/route.ts
import { NextResponse } from "next/server";
import { generateAndStoreDashboardForDate } from "@/services/generateDashboardForDate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Normalise un secret :
 * - trim des espaces
 * - supprime les guillemets éventuels
 */
function normalizeSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const unquoted = trimmed.replace(/^['"](.+)['"]$/, "$1");
  return unquoted || null;
}

export async function POST(req: Request) {
  // Auth du cron
  const authHeaderRaw = req.headers.get("authorization");
  const cronSecretRaw = process.env.CRON_SECRET;

  const cronSecret = normalizeSecret(cronSecretRaw);
  const headerToken = normalizeSecret(
    authHeaderRaw?.toLowerCase().startsWith("bearer ")
      ? authHeaderRaw.slice(7)
      : authHeaderRaw ?? null,
  );

  if (!cronSecret || !headerToken || headerToken !== cronSecret) {
    console.warn("[cron] Unauthorized call", {
      hasSecret: Boolean(cronSecretRaw),
      hasHeader: Boolean(authHeaderRaw),
    });

    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Génération J0 à J+6
  const today = new Date();
  const results: any[] = [];

  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);

    const dateStr = d.toISOString().slice(0, 10);

    try {
      const payload = await generateAndStoreDashboardForDate(dateStr);
      results.push({
        date: dateStr,
        matchCount: payload.matches.length,
        ok: true,
      });

      console.log(`[cron] ${dateStr} → ${payload.matches.length} matchs`);
    } catch (e) {
      console.error("[cron] Error on", dateStr, e);
      results.push({
        date: dateStr,
        ok: false,
        error: true,
      });
    }
  }

  return NextResponse.json(
    {
      ok: true,
      generated: results.length,
      details: results,
    },
    { status: 200 },
  );
}
