import { NextResponse } from "next/server";
import { rateLimit } from "@/utils/rateLimit";

// Appelle rateLimit avec une clé arbitraire `rltest:<key>` plusieurs fois
export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key") || "default";
  const n = Math.max(1, Math.min(50, Number(url.searchParams.get("n")) || 1));

  const results: any[] = [];
  for (let i = 0; i < n; i++) {
    // la clé réelle
    const fullKey = `rltest:${key}`;
    const r = await rateLimit(fullKey);
    results.push({ i: i + 1, key: fullKey, ...r });
    // petite pause pour imiter du trafic
    await new Promise((r) => setTimeout(r, 50));
  }

  return NextResponse.json({
    env: {
      url: process.env.UPSTASH_REDIS_REST_URL ? "✅" : "❌",
      token: process.env.UPSTASH_REDIS_REST_TOKEN ? "✅" : "❌",
      rlKey: process.env.RL_KEY_SECRET ? "✅" : "❌",
      nodeEnv: process.env.NODE_ENV,
    },
    results,
  });
}
