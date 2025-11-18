// src/utils/rateLimit.ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import crypto from "node:crypto";

type UpstashResponse = {
  success: boolean;
  limit?: number;
  remaining?: number;
  reset?: number;
  pending?: number;
};

declare global {
  var __zonestat_rl__:
    | {
        redis: Redis | null;
        limiter: Ratelimit | null;
      }
    | undefined;
}

const RL_KEY_SECRET = process.env.RL_KEY_SECRET;
const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

function isTestEnv() {
  return process.env.NODE_ENV === "test";
}

function hasUpstashConfigured(): boolean {
  if (isTestEnv()) return false;
  return Boolean(UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN && RL_KEY_SECRET);
}

function getLimiter() {
  if (!hasUpstashConfigured()) {
    return { redis: null, limiter: null } as const;
  }

  if (!global.__zonestat_rl__) {
    const redis = new Redis({
      url: UPSTASH_REDIS_REST_URL!,
      token: UPSTASH_REDIS_REST_TOKEN!,
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

function parseWindowToMs(window: `${number} ${"s" | "m" | "h"}`): number {
  const [amountStr, unit] = window.split(" ");
  const amount = Number(amountStr);
  if (!Number.isFinite(amount) || amount <= 0) return 30_000;

  switch (unit) {
    case "s":
      return amount * 1_000;
    case "m":
      return amount * 60_000;
    case "h":
      return amount * 3_600_000;
    default:
      return 30_000;
  }
}

type MemoryEntry = {
  count: number;
  resetAt: number;
};

const memoryStore = new Map<string, MemoryEntry>();

export async function rateLimit(
  key: string,
  opts?: { limit?: number; window?: `${number} ${"s" | "m" | "h"}` },
): Promise<RateLimitResult> {
  const env = process.env.NODE_ENV || "development";
  const windowStr: `${number} ${"s" | "m" | "h"}` = opts?.window ?? "30 s";
  const limit = opts?.limit ?? 5;

  const bucketKey = RL_KEY_SECRET
    ? crypto
        .createHmac("sha256", RL_KEY_SECRET)
        .update(key)
        .digest("hex")
    : key;

  const windowMs = parseWindowToMs(windowStr);

  if (!hasUpstashConfigured()) {
    const now = Date.now();
    const resetAt = now + windowMs;

    if (env === "production") {
      return {
        ok: false,
        limit,
        remaining: 0,
        reset: resetAt,
        reason: "upstash_not_configured_production",
      };
    }

    if (memoryStore.size > 0) {
      for (const [memoryKey, entry] of memoryStore) {
        if (entry.resetAt <= now) {
          memoryStore.delete(memoryKey);
        }
      }
    }

    const bucket = Math.floor(now / windowMs);
    const memoryKey = `mem:${limit}:${windowStr}:${bucket}:${bucketKey}`;

    const existing = memoryStore.get(memoryKey) ?? { count: 0, resetAt };
    existing.count += 1;
    existing.resetAt = resetAt;
    memoryStore.set(memoryKey, existing);

    const ok = existing.count <= limit;

    return {
      ok,
      limit,
      remaining: Math.max(0, limit - existing.count),
      reset: existing.resetAt,
      reason: "memory_fallback",
    };
  }

  const { limiter } = getLimiter();
  if (!limiter) {
    return { ok: true, reason: "limiter_not_initialized" };
  }

  type ExtendedLimiter = Ratelimit & { redis: Redis };

  const extendedLimiter = limiter as ExtendedLimiter;

  const customLimiter =
    opts?.limit || opts?.window
      ? new Ratelimit({
          redis: extendedLimiter.redis,
          limiter: Ratelimit.slidingWindow(limit, windowStr),
          analytics: true,
          prefix: "zonestat:rl",
        })
      : limiter;

  // ⬇⬇⬇ SEULE PARTIE MODIFIÉE : on sécurise l'appel pour éviter les erreurs `evalsha` ⬇⬇⬇
  let r: UpstashResponse;

  try {
    r = (await customLimiter.limit(bucketKey)) as UpstashResponse;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[rateLimit] customLimiter.limit(bucketKey) a échoué, fallback ALLOW (upstash_runtime_error).",
        error,
      );
    }

    // On préfère ne pas casser la route (500) en cas d'erreur Upstash runtime.
    return {
      ok: true,
      limit,
      remaining: limit,
      reset: Date.now() + windowMs,
      reason: "upstash_runtime_error",
    };
  }

  return {
    ok: r.success,
    limit: r.limit,
    remaining: r.remaining,
    reset: r.reset,
  };
}
