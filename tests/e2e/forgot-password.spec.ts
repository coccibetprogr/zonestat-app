// tests/e2e/forgot-password.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Mot de passe oublié", () => {
  test("envoie un lien de réinitialisation avec message générique", async ({ page }) => {
    // 1) Aller sur la page "mot de passe oublié"
    await page.goto("/auth/forgot");

    // 2) Vérifier que la page s'affiche
    await expect(page.getByRole("heading", { name: /mot de passe oublié/i })).toBeVisible();

    // 3) Remplir l'email (valeur arbitraire ; le message reste générique pour éviter l'énumération)
    await page.getByPlaceholder(/@/).fill("user@example.com");

    // 4) Le cookie CSRF est posé par le middleware — on s'assure que la page a eu le temps de se stabiliser
    // (Le form inclut un input hidden "csrf" rempli depuis le cookie ; pas besoin de le gérer côté test.)

    // 5) Soumettre le formulaire
    // Bouton "Envoyer le lien"
    const submit = page.getByRole("button", { name: /envoyer le lien/i });
    await expect(submit).toBeEnabled();
    await submit.click();

    // 6) Attendre la réponse et vérifier le message générique (ok)
    // "Si un compte existe avec cet email, un lien a été envoyé."
    await expect(
      page.getByText(/si un compte existe avec cet email, un lien a été envoyé/i)
    ).toBeVisible({ timeout: 10_000 });

    // 7) Revenir au login via le lien prévu (vérif navigation)
    const backToLogin = page.getByRole("link", { name: /revenir à la connexion/i });
    await backToLogin.click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: /connexion/i })).toBeVisible();
  });

  test("lien direct depuis la page login", async ({ page }) => {
    await page.goto("/login");
    const forgotLink = page.getByRole("link", { name: /mot de passe oublié/i });
    await expect(forgotLink).toBeVisible();
    await forgotLink.click();
    await expect(page).toHaveURL(/\/auth\/forgot$/);
  });
});
