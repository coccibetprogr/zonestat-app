import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    url: process.env.UPSTASH_REDIS_REST_URL || null,
    token: process.env.UPSTASH_REDIS_REST_TOKEN ? "✅ loaded" : "❌ missing",
    rlKey: process.env.RL_KEY_SECRET ? "✅ loaded" : "❌ missing",
  });
}
