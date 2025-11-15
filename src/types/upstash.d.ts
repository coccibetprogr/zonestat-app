// src/types/upstash.d.ts

// Shims minimalistes pour éviter "Cannot find module" quand les paquets ne sont pas installés.
// Si tu installes @upstash/*, ces déclarations pourront coexister sans souci.

declare module "@upstash/ratelimit" {
  export type RatelimitConfig = Record<string, unknown>;
  export type SlidingWindowLimiter = (...args: unknown[]) => unknown;
  export type RatelimitResult = {
    success: boolean;
    limit?: number;
    remaining?: number;
    reset?: number;
  };

  export class Ratelimit {
    constructor(config: RatelimitConfig);
    static slidingWindow(limit: number, window: string): SlidingWindowLimiter;
    limit(key: string): Promise<RatelimitResult>;
  }
}

declare module "@upstash/redis" {
  export type RedisConfig = Record<string, unknown>;

  export class Redis {
    constructor(config: RedisConfig);
  }
}
