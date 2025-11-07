// src/types/upstash.d.ts

// Shims minimalistes pour éviter "Cannot find module" quand les paquets ne sont pas installés.
// Si tu installes @upstash/*, ces déclarations pourront coexister sans souci.

declare module "@upstash/ratelimit" {
  export class Ratelimit {
    constructor(config: any);
    static slidingWindow(limit: number, window: string): any;
    limit(key: string): Promise<{ success: boolean }>;
  }
}

declare module "@upstash/redis" {
  export class Redis {
    constructor(config: any);
  }
}
