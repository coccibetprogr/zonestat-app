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

const hasUpstash =
  Boolean(process.env.UPSTASH_REDIS_REST_URL) &&
  Boolean(process.env.UPSTASH_REDIS_REST_TOKEN);

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
  if (!hasUpstash) {
    return { ok: true, reason: "upstash_not_configured" };
  }

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
