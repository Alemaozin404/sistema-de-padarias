import { describe, expect, it } from "vitest";
import { toCsv, type LgpdExport } from "@/modules/lgpd/export";

describe("exportação LGPD em CSV", () => {
  it("gera BOM, cabeçalho e uma linha por registro", () => {
    const data: LgpdExport = {
      formatVersion: 1,
      generatedAt: "2026-01-01T00:00:00.000Z",
      tenant: { id: "tenant-1", tradeName: "Padaria" },
      memberships: [{ membershipId: "m1", userId: "u1" }],
      catalog: { categories: [], products: [], productImages: [], priceHistory: [] },
      inventory: { ingredients: [], balances: [], movements: [] },
      production: { recipes: [], recipeItems: [], batches: [], losses: [] },
      billing: {
        subscription: null,
        statusHistory: [],
        invoices: [],
        payments: [],
        discounts: [],
        notifications: [],
      },
      auditLogs: [],
    };

    const csv = toCsv(data);

    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("recurso,id,dados");
    expect(csv).toContain("tenant,tenant-1,");
    expect(csv).toContain("memberships,m1,");
    expect(csv.split("\r\n").length).toBe(3);
  });

  it("escapa aspas em valores", () => {
    const data: LgpdExport = {
      formatVersion: 1,
      generatedAt: "2026-01-01T00:00:00.000Z",
      tenant: { id: "t", tradeName: 'Padaria "Central"' },
      memberships: [],
      catalog: { categories: [], products: [], productImages: [], priceHistory: [] },
      inventory: { ingredients: [], balances: [], movements: [] },
      production: { recipes: [], recipeItems: [], batches: [], losses: [] },
      billing: {
        subscription: null,
        statusHistory: [],
        invoices: [],
        payments: [],
        discounts: [],
        notifications: [],
      },
      auditLogs: [],
    };

    const csv = toCsv(data);
    expect(csv).toContain("Central");
    expect(csv).toContain('""id""');
  });
});
