// src/app/api/cron/generate-dashboard/route.ts
import { NextResponse } from "next/server";
import { generateAndStoreDashboardForDate } from "@/services/generateDashboardForDate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || !authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)

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
