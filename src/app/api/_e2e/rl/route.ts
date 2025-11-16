// === FILE: src/app/api/_e2e/rl/route.ts ===
import { NextResponse } from "next/server";
import { rateLimit } from "@/utils/rateLimit";

export async function GET(req: Request) {
  const isTestEnv = process.env.NODE_ENV === "test";
  const isE2eEnabled = process.env.E2E_RL_ENABLED === "true";

  // 🔒 Par défaut, endpoint indispo en prod / dev.
  // Pour les tests E2E réels, tu peux définir E2E_RL_ENABLED="true".
  if (!isTestEnv && !isE2eEnabled) {
    return new NextResponse("Not found", { status: 404 });
  }

  const ip =
    req.headers.get("x-zonestat-ip") ||
    req.headers.get("x-vercel-ip") ||
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",").pop()?.trim() ||
    "unknown";

  // Fenêtre courte pour tests (10 s) / limite 5
  const key = `e2e:rl:${ip}`;
  const r = await rateLimit(key, { limit: 5, window: "10 s" });

  if (!r.ok) {
    return new NextResponse("RL_BLOCKED", { status: 429 });
  }
  return new NextResponse("RL_OK", { status: 200 });
}
