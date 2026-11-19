import { describe, expect, it } from "vitest";
import {
  canPublishProduct,
  groupByCategory,
  nextSortOrder,
  parsePriceToCents,
  toPublicProduct,
  type PublicProductSource,
} from "@/modules/catalog/rules";

describe("parsePriceToCents", () => {
  it("aceita formato brasileiro e internacional", () => {
    expect(parsePriceToCents("12,50")).toBe(1250);
    expect(parsePriceToCents("12.50")).toBe(1250);
    expect(parsePriceToCents("R$ 12,50")).toBe(1250);
    expect(parsePriceToCents("1.234,56")).toBe(123456);
    expect(parsePriceToCents("8")).toBe(800);
  });

  it("recusa entrada inválida em vez de assumir zero", () => {
    expect(parsePriceToCents("")).toBeNull();
    expect(parsePriceToCents("abc")).toBeNull();
    expect(parsePriceToCents("12,345")).toBeNull();
    expect(parsePriceToCents("-5")).toBeNull();
    expect(parsePriceToCents("1.000.000,01")).toBeNull();
  });

  it("arredonda centavos sem erro de ponto flutuante", () => {
    expect(parsePriceToCents("0,07")).toBe(7);
    expect(parsePriceToCents("19,99")).toBe(1999);
  });
});

describe("canPublishProduct", () => {
  it("exige produto ativo e preço maior que zero", () => {
    expect(canPublishProduct({ isActive: true, priceCents: 500 })).toBe(true);
    expect(canPublishProduct({ isActive: false, priceCents: 500 })).toBe(false);
    expect(canPublishProduct({ isActive: true, priceCents: 0 })).toBe(false);
  });
});

describe("nextSortOrder", () => {
  it("começa em zero e avança de dez em dez", () => {
    expect(nextSortOrder([])).toBe(0);
    expect(nextSortOrder([0, 10, 20])).toBe(30);
  });
});

const base: PublicProductSource = {
  id: "0198f0aa-0000-7000-8000-000000000001",
  name: "Pão Francês",
  slug: "pao-frances",
  description: "Assado na hora",
  priceCents: 90,
  unit: "UN",
  imageKey: null,
  isAvailable: true,
  isActive: true,
  deletedAt: null,
  categoryName: "Pães",
  categorySlug: "paes",
};

describe("toPublicProduct", () => {
  it("expõe apenas campos públicos", () => {
    const result = toPublicProduct(base);
    expect(result).not.toBeNull();
    expect(Object.keys(result ?? {}).sort()).toEqual(
      [
        "categoryName",
        "categorySlug",
        "description",
        "id",
        "imageKey",
        "name",
        "priceCents",
        "slug",
        "unit",
      ].sort(),
    );
  });

  it("nunca inclui custo ou estoque, mesmo que existam na origem", () => {
    const withInternals = {
      ...base,
      costCents: 45,
      currentStock: 12,
      minStock: "5",
      sku: "PF-001",
    } as PublicProductSource;

    const result = toPublicProduct(withInternals);
    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty("costCents");
    expect(result).not.toHaveProperty("currentStock");
    expect(result).not.toHaveProperty("minStock");
    expect(result).not.toHaveProperty("sku");
  });

  it("esconde produto não publicado, inativo, arquivado ou sem preço", () => {
    expect(toPublicProduct({ ...base, isAvailable: false })).toBeNull();
    expect(toPublicProduct({ ...base, isActive: false })).toBeNull();
    expect(toPublicProduct({ ...base, deletedAt: new Date() })).toBeNull();
    expect(toPublicProduct({ ...base, priceCents: 0 })).toBeNull();
  });
});

describe("groupByCategory", () => {
  it("agrupa mantendo ordem e junta produtos sem categoria", () => {
    const a = toPublicProduct(base);
    const b = toPublicProduct({ ...base, id: "2", name: "Baguete", categoryName: "Pães" });
    const c = toPublicProduct({
      ...base,
      id: "3",
      name: "Café",
      categoryName: null,
      categorySlug: null,
    });

    const groups = groupByCategory([a!, b!, c!]);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.name).toBe("Pães");
    expect(groups[0]?.products).toHaveLength(2);
    expect(groups[1]?.name).toBe("Outros");
  });
});
