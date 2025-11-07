import { describe, it, expect } from "vitest";
import { rateLimit } from "../../src/utils/rateLimit";

describe("rateLimit fallback mémoire", () => {
  it("autorise sous le seuil", async () => {
    const key = `test-key-${Date.now()}`;
    for (let i = 0; i < 5; i++) {
      const r = await rateLimit(key);
      expect(r.ok).toBeTypeOf("boolean");
      expect(r.ok).toBe(true);
    }
  });

  it("bloque au-delà du seuil", async () => {
    const key = `test-key-limit-${Date.now()}`;
    let last = { ok: true as boolean };
    for (let i = 0; i < 12; i++) {
      last = await rateLimit(key);
    }
    expect(last.ok).toBe(false);
  });
});
