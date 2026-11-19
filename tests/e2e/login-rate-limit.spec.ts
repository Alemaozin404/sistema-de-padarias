import { expect, test } from "@playwright/test";

test.describe("rate limit de login", () => {
  test("bloqueia após várias tentativas com a mesma conta", async ({ page }) => {
    const email = `rate-limit-${Date.now()}@example.com`;

    await page.goto("/login");

    for (let attempt = 0; attempt < 6; attempt++) {
      await page.fill('input[name="email"]', email);
      await page.fill('input[name="password"]', "senha-invalida-123");
      await page.click('button[type="submit"]');
      await page.waitForTimeout(150);
    }

    await expect(page.getByRole("alert")).toContainText(/muitas tentativas/i);
  });
});
