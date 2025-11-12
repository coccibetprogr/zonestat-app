// === FILE: tests/e2e/origin.spec.ts ===
import { test, expect, request as playwrightRequest } from "@playwright/test";

test("logout: Origin non autorisé -> 403", async ({ request }) => {
  // 1) GET / pour récupérer le cookie CSRF
  const resHome = await request.get("http://localhost:3000/");
  const setCookie = resHome.headers()["set-cookie"] || "";
  const match = /csrf=([^;]+)/i.exec(setCookie);
  const csrfPair = match?.[1] ?? ""; // token:ts (url-encoded)
  const csrfToken = decodeURIComponent(csrfPair).split(":")[0] ?? "";

  // 2) POST /auth/logout avec Origin malveillant
  const res = await request.post("http://localhost:3000/auth/logout", {
    headers: {
      "Origin": "https://evil.tld",
      "Content-Type": "application/x-www-form-urlencoded",
      "Cookie": `csrf=${csrfPair}`,
    },
    data: new URLSearchParams({ csrf: csrfToken }).toString(),
  });

  expect(res.status()).toBe(403);
  const body = await res.text();
  expect(body).toMatch(/Invalid origin|403/i);
});
