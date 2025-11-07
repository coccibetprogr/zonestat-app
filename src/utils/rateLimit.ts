// src/utils/rateLimit.ts
// Production: Upstash/Redis prioritaire ; SI indisponible/mal configuré → fallback mémoire (dégradé, mais pas d'indispo).
// Non-prod: fallback mémoire toléré (DX).

const IS_PROD = process.env.NODE_ENV === "production";

type Hit = { count: number; first: number };
const MEM_BUCKET = new Map<string, Hit>();
const WINDOW_MS = 60_000; // 1 min
const LIMIT_UPSTASH = 20; // cible
const LIMIT_MEMORY = 10;  // un peu plus strict en fallback

function inMemoryRateLimit(key: string) {
  const now = Date.now();
  const rec = MEM_BUCKET.get(key);
  if (!rec || now - rec.first > WINDOW_MS) {
    MEM_BUCKET.set(key, { count: 1, first: now });
    return { ok: true };
  }
  rec.count += 1;
  if (rec.count > LIMIT_MEMORY) return { ok: false };
  return { ok: true };
}

let limiterPromise:
  | Promise<{ limit: (key: string) => Promise<{ success: boolean }> }>
  | null = null;

async function getUpstashLimiter() {
  if (limiterPromise) return limiterPromise;

  limiterPromise = (async () => {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
      // On laisse l'appelant tomber en fallback mémoire
      throw new Error("Upstash env missing");
    }
    // @ts-ignore shims via src/types/upstash.d.ts
    const { Ratelimit } = await import("@upstash/ratelimit");
    // @ts-ignore shims via src/types/upstash.d.ts
    const { Redis } = await import("@upstash/redis");

    const redis = new Redis({ url, token });
    const limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(LIMIT_UPSTASH, "1 m"),
    });
    return limiter;
  })();

  return limiterPromise;
}

export async function rateLimit(key: string) {
  try {
    const limiter = await getUpstashLimiter();
    const { success } = await limiter.limit(key);
    return { ok: success };
  } catch {
    if (IS_PROD) {
      try {
        // eslint-disable-next-line no-console
        console.warn("[rateLimit] Upstash indisponible → fallback mémoire activé en production");
      } catch {}
    }
    return inMemoryRateLimit(key);
  }
}
