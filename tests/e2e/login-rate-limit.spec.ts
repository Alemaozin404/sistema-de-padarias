import { expect, test } from "@playwright/test";

test.describe("rate limit de login", () => {
  test("bloqueia após várias tentativas com a mesma conta", async ({ page }) => {
    const email = `rate-limit-${Date.now()}@example.com`;

    await page.goto("/login");

    const submit = page.locator('button[type="submit"]');

    for (let attempt = 0; attempt < 6; attempt++) {
      await page.fill('input[name="email"]', email);
      await page.fill('input[name="password"]', "senha-invalida-123");
      await submit.click();
      await expect(submit).toBeEnabled({ timeout: 10_000 });
      await page.waitForTimeout(100);
    }

    await expect(page.locator('p[role="alert"]')).toContainText(/muitas tentativas/i);
  });
});
