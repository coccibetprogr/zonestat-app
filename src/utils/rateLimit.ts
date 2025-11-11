// src/utils/rateLimit.ts
// Production: Upstash/Redis prioritaire ; SI indisponible/mal configuré → en production on *ne pas* basculer en fallback mémoire (fail-closed).
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
      // Indique explicitement l'absence de config
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

// --- utilitaire sûr pour extraire un message d'erreur depuis `unknown`
function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

export async function rateLimit(key: string) {
  try {
    const limiter = await getUpstashLimiter();
    const { success } = await limiter.limit(key);
    return { ok: success };
  } catch (e: unknown) {
    // En prod : fail-closed — si Upstash indisponible, refuser (protéger l'application).
    if (IS_PROD) {
      try {
        // eslint-disable-next-line no-console
        console.error("[rateLimit] Upstash indisponible en production -> fail-closed", errMsg(e));
      } catch {
        /* noop */
      }
      return { ok: false };
    }
    // En dev/test : fallback mémoire pour la DX
    try {
      // eslint-disable-next-line no-console
      console.warn("[rateLimit] Upstash indisponible -> fallback mémoire (dev/test)", errMsg(e));
    } catch {
      /* noop */
    }
    return inMemoryRateLimit(key);
  }
}
