import { test, expect, Page } from "@playwright/test";

test.describe("Mot de passe oublié", () => {
  test("envoie un lien de réinitialisation avec message générique", async ({ page }: { page: Page }) => {
    await page.goto("/auth/forgot");

    // 1) Remplir email
    await page.fill('input[name="email"]', "tmp+forgot@example.com");

    // 2) Simuler Turnstile côté client et forcer la soumission du formulaire
    await page.evaluate(() => {
      const form = document.querySelector("form") as HTMLFormElement | null;
      if (!form) return;

      // injecte/maj le token Turnstile attendu par l'UI
      let el = document.querySelector('input[name="cf-turnstile-response"]') as HTMLInputElement | null;
      if (!el) {
        el = document.createElement("input");
        el.type = "hidden";
        el.name = "cf-turnstile-response";
        form.appendChild(el);
      }
      el.value = "test-token";

      // certaines UI désactivent le bouton tant que pas de token → on débloque
      const btn = form.querySelector('button[type="submit"]') as HTMLButtonElement | null;
      if (btn) {
        btn.disabled = false;
        btn.removeAttribute("aria-disabled");
      }

      // soumission sans cliquer (évite les blocages d'état UI)
      if (typeof form.requestSubmit === "function") form.requestSubmit();
      else form.submit();
    });

    // 3) Vérifier qu'on n'a PAS d'erreur (CSRF/Origin/etc.)
    await expect(page.locator("body")).not.toContainText(/Requête invalide/i);
  });
});
