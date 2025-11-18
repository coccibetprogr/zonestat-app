import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/unit/**/*.test.{ts,js}"],
    coverage: {
      provider: "v8",          // ← ex-c8 → v8
      reporter: ["text", "lcov"]
    }
  }
});
