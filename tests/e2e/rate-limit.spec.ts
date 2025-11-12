// === FILE: tests/e2e/rate-limit.spec.ts ===
import { test, expect } from "@playwright/test";

test("API RL: bloque après 5 requêtes depuis la même IP", async ({ request }) => {
  const base = "http://localhost:3000";
  const headers = { "x-forwarded-for": "9.9.9.9" }; // Middleware copiera en x-zonestat-ip en local

  let blocked = false;
  for (let i = 1; i <= 6; i++) {
    const res = await request.get(`${base}/api/_e2e/rl`, { headers });
    const txt = await res.text();
    if (res.status() === 429 || /RL_BLOCKED/.test(txt)) {
      blocked = true;
      break;
    }
  }
  expect(blocked).toBeTruthy();
});
