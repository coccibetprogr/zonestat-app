import { test, expect } from "@playwright/test";

test.describe("Auth smoke", () => {
  test("visit login page", async ({ page }) => {
    const base = process.env.BASE_URL || "http://localhost:3000";
    await page.goto(`${base}/login`);
    await expect(page).toHaveTitle(/ZoneStat|Connexion/i);

    // on surveille les requêtes réseau
    const requests: string[] = [];
    page.on("request", (req) => requests.push(req.url()));

    // on attend un petit peu
    await page.waitForTimeout(800);

    // on compte les requêtes vers /csrf
    const csrfHits = requests.filter((u) => u.includes("/csrf")).length;
    expect(csrfHits).toBeLessThanOrEqual(2);
  });
});
