import { expect, test } from "@playwright/test";

const hasDatabase = Boolean(process.env.DATABASE_URL);

test.describe("separação de realm", () => {
  test("a página de login do admin é distinta da do estabelecimento", async ({ page }) => {
    await page.goto("/admin/login");
    await expect(page.getByRole("heading", { name: /acesso restrito/i })).toBeVisible();
  });

  test("acesso não autenticado ao painel redireciona para o login", async ({ request }) => {
    test.skip(!hasDatabase, "requer DATABASE_URL configurada");
    const response = await request.get("/admin", { maxRedirects: 0 });
    expect([301, 302, 303, 307, 308]).toContain(response.status());
    expect(response.headers().location).toContain("/admin/login");
  });

  test("exportação LGPD sem sessão é negada", async ({ request }) => {
    test.skip(!hasDatabase, "requer DATABASE_URL configurada");
    const response = await request.get("/api/lgpd/export", { maxRedirects: 0 });
    expect([401, 403]).toContain(response.status());
  });
});
