// === FILE: tests/e2e/csrf.spec.ts ===
import { test, expect, Page } from "@playwright/test";

// Util: lit la valeur du cookie CSRF
async function getCsrfCookie(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  const csrf = cookies.find((c) => c.name === "csrf");
  return csrf?.value ?? "";
}

test.describe("CSRF", () => {
  test("login: CSRF OK (pas d'erreur quand cookie/body concordent)", async ({ page }: { page: Page }) => {
    await page.goto("/login");
    await page.fill('input[name="email"]', "john@example.com");
    await page.fill('input[name="password"]', "wrong");
    await page.click('button[type="submit"]');
    await expect(page.locator("body")).not.toContainText(/Requête invalide \(csrf\)/i);
  });

  test("signup: CSRF OK", async ({ page }: { page: Page }) => {
    await page.goto("/signup");
    await page.fill('input[name="email"]', "tmp+e2e@example.com");
    await page.fill('input[name="password"]', "123456");
    await page.click('button[type="submit"]');
    await expect(page.locator("body")).not.toContainText(/Requête invalide \(csrf\)/i);
  });
});
