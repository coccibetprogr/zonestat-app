// src/utils/rateLimit.ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type UpstashResponse = {
  success: boolean;
  limit?: number;
  remaining?: number;
  reset?: number;
  pending?: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __zonestat_rl__:
    | {
        redis: Redis | null;
        limiter: Ratelimit | null;
      }
    | undefined;
}

const isTestEnv = process.env.NODE_ENV === "test";

function hasUpstashConfigured(): boolean {
  // En tests (vitest, CI), on force le fallback mémoire,
  // même si les variables d'env Upstash sont présentes.
  if (isTestEnv) return false;

  return (
    Boolean(process.env.UPSTASH_REDIS_REST_URL) &&
    Boolean(process.env.UPSTASH_REDIS_REST_TOKEN)
  );
}

function getLimiter() {
  const hasUpstash = hasUpstashConfigured();
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

export type RateLimitResult = {
  ok: boolean;
  limit?: number;
  remaining?: number;
  reset?: number;
  reason?: string;
};

// 🔹 Fallback mémoire quand Upstash n'est pas utilisé
type MemoryEntry = {
  count: number;
  resetAt: number;
};

const memoryStore = new Map<string, MemoryEntry>();

function parseWindowToMs(window: `${number} ${"s" | "m" | "h"}`): number {
  const [valueStr, unit] = window.split(" ") as [string, "s" | "m" | "h"];
  const value = Number(valueStr);
  if (!Number.isFinite(value) || value <= 0) return 30_000;

  switch (unit) {
    case "s":
      return value * 1_000;
    case "m":
      return value * 60_000;
    case "h":
      return value * 3_600_000;
    default:
      return 30_000;
  }
}

export async function rateLimit(
  key: string,
  opts?: { limit?: number; window?: `${number} ${"s" | "m" | "h"}` }
): Promise<RateLimitResult> {
  // -------------------------
  // Fallback mémoire si Upstash n'est pas utilisé
  // (non configuré OU NODE_ENV === "test")
  // -------------------------
  if (!hasUpstashConfigured()) {
    const limit = opts?.limit ?? 5;
    const windowStr = opts?.window ?? "30 s";
    const windowMs = parseWindowToMs(windowStr);

    const now = Date.now();
    const existing = memoryStore.get(key);

    let entry: MemoryEntry;
    if (!existing || existing.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
    } else {
      entry = existing;
    }

    // On incrémente AVANT de tester, comme un vrai compteur de requêtes
    entry.count += 1;
    memoryStore.set(key, entry);

    const ok = entry.count <= limit;
    const remaining = ok ? limit - entry.count : 0;

    return {
      ok,
      limit,
      remaining,
      reset: entry.resetAt,
      reason: "memory_fallback",
    };
  }

  // -------------------------
  // Chemin normal Upstash (dev/prod uniquement)
  // -------------------------
  const { limiter } = getLimiter();
  if (!limiter) {
    return { ok: true, reason: "limiter_not_initialized" };
  }

  if (opts?.limit || opts?.window) {
    const custom = new Ratelimit({
      redis: (limiter as any).redis as Redis,
      limiter: Ratelimit.slidingWindow(opts?.limit ?? 5, opts?.window ?? "30 s"),
      analytics: true,
      prefix: "zonestat:rl",
    });

    const r = (await custom.limit(key)) as UpstashResponse;
    return {
      ok: r.success,
      limit: r.limit,
      remaining: r.remaining,
      reset: r.reset,
    };
  }

  const r = (await limiter.limit(key)) as UpstashResponse;
  return {
    ok: r.success,
    limit: r.limit,
    remaining: r.remaining,
    reset: r.reset,
  };
}
