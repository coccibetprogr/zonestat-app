import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests",                       // 📁 dossier des tests
  testIgnore: ["tests/unit/**"],          // ❌ ignore les tests Vitest
  testMatch: ["**/e2e/**/*.spec.ts"],     // ✅ ne garde que les e2e
  timeout: 30 * 1000,
  expect: { timeout: 5000 },
  fullyParallel: true,
  reporter: "list",
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    actionTimeout: 10000,
    baseURL: process.env.BASE_URL || "http://localhost:3000"
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } }
  ]
});
