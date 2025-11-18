// src/app/api/debug-football-env/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    hasKey: Boolean(process.env.API_FOOTBALL_API_KEY),
    baseUrl: process.env.API_FOOTBALL_BASE_URL,
    timezone: process.env.API_FOOTBALL_TIMEZONE,
    leaguesFilter: process.env.API_FOOTBALL_LEAGUES,
  });
}
