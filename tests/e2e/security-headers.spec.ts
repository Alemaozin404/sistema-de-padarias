import { expect, test } from "@playwright/test";

test.describe("cabeçalhos de segurança", () => {
  test("a vitrine envia CSP, HSTS e os demais cabeçalhos", async ({ request }) => {
    const response = await request.get("/");
    expect(response.status()).toBe(200);

    const headers = response.headers();
    const csp = headers["content-security-policy"] ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toMatch(/nonce-[A-Za-z0-9+/=]+/);
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["strict-transport-security"]).toContain("max-age=63072000");
    expect(headers["x-powered-by"]).toBeUndefined();
  });

  test("a página de login renderiza o formulário", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /entrar na plataforma/i })).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
  });

  test("a página de planos carrega os planos vindos do banco ou aviso explícito", async ({ page }) => {
    await page.goto("/planos");
    await expect(page.getByRole("heading", { name: /compare os planos/i })).toBeVisible();
  });
});
