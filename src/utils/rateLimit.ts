// === FILE: src/utils/rateLimit.ts ===
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type UpstashResponse = {
  success: boolean;
  limit?: number;
  remaining?: number;
  reset?: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __zonestat_rl__:
    | {
        redis: Redis | null;
        limiter: Ratelimit | null;
      }
    | undefined;

  // eslint-disable-next-line no-var
  var __zonestat_memrl__:
    | {
        hits: Map<string, number[]>;
        windowMs: number;
        limit: number;
      }
    | undefined;
}

const hasUpstash =
  Boolean(process.env.UPSTASH_REDIS_REST_URL) &&
  Boolean(process.env.UPSTASH_REDIS_REST_TOKEN);

// ⛳️ Forcer le fallback mémoire (pour e2e): RL_FORCE_MEM=1
const FORCE_MEM = process.env.RL_FORCE_MEM === "1";

function getLimiter() {
  if (!hasUpstash) return { redis: null, limiter: null } as const;

  if (!global.__zonestat_rl__) {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });

    const limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "30 s"),
      analytics: true,
      prefix: "zonestat:rl",
    });

    global.__zonestat_rl__ = { redis, limiter };
  }
  return global.__zonestat_rl__!;
}

// --- Fallback mémoire pour DEV/TEST ---
function memLimiter(windowMs = 30_000, limit = 5) {
  if (!global.__zonestat_memrl__) {
    global.__zonestat_memrl__ = { hits: new Map(), windowMs, limit };
  }
  const store = global.__zonestat_memrl__;
  return {
    async limit(key: string): Promise<UpstashResponse> {
      const now = Date.now();
      const arr = store.hits.get(key) || [];
      const recent = arr.filter((t) => now - t < store.windowMs);
      if (recent.length >= store.limit) {
        store.hits.set(key, recent);
        return {
          success: false,
          limit: store.limit,
          remaining: 0,
          reset: now + store.windowMs,
        };
      }
      recent.push(now);
      store.hits.set(key, recent);
      return {
        success: true,
        limit: store.limit,
        remaining: Math.max(0, store.limit - recent.length),
        reset: now + store.windowMs,
      };
    },
  };
}

export type RateLimitResult = {
  ok: boolean;
  limit?: number;
  remaining?: number;
  reset?: number;
  reason?: string;
};

export async function rateLimit(
  key: string,
  opts?: { limit?: number; window?: `${number} ${"s" | "m" | "h"}` }
): Promise<RateLimitResult> {
  // 1) Forçage mémoire pour e2e (indépendant de NODE_ENV)
  if (FORCE_MEM) {
    const win = parseWindow(opts?.window ?? "30 s");
    const lim = opts?.limit ?? 5;
    const mem = memLimiter(win, lim);
    const r = await mem.limit(key);
    return { ok: r.success, limit: r.limit, remaining: r.remaining, reset: r.reset, reason: "mem_forced" };
  }

  // 2) PROD stricte: Upstash obligatoire
  if (process.env.NODE_ENV === "production" && !hasUpstash) {
    throw new Error("Upstash Redis is required in production");
  }

  // 3) Upstash dispo → l'utiliser
  if (hasUpstash) {
    const { limiter } = getLimiter();
    if (!limiter) {
      return { ok: false, reason: "limiter_not_initialized" };
    }

    if (opts?.limit || opts?.window) {
      const custom = new Ratelimit({
        redis: (limiter as any).redis as Redis,
        limiter: Ratelimit.slidingWindow(opts?.limit ?? 5, opts?.window ?? "30 s"),
        analytics: true,
        prefix: "zonestat:rl",
      });
      const r = (await custom.limit(key)) as UpstashResponse;
      return { ok: r.success, limit: r.limit, remaining: r.remaining, reset: r.reset };
    }

    const r = (await limiter.limit(key)) as UpstashResponse;
    return { ok: r.success, limit: r.limit, remaining: r.remaining, reset: r.reset };
  }

  // 4) DEV/TEST sans Upstash → mémoire
  const win = parseWindow(opts?.window ?? "30 s");
  const lim = opts?.limit ?? 5;
  const mem = memLimiter(win, lim);
  const r = await mem.limit(key);
  return { ok: r.success, limit: r.limit, remaining: r.remaining, reset: r.reset };
}

function parseWindow(w: `${number} ${"s" | "m" | "h"}`): number {
  const [nStr, unit] = w.split(" ") as [string, "s" | "m" | "h"];
  const n = Number(nStr);
  switch (unit) {
    case "s":
      return n * 1000;
    case "m":
      return n * 60_000;
    case "h":
      return n * 3_600_000;
    default:
      return 30_000;
  }
}
