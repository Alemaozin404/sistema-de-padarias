/**
 * Regras puras do catálogo: conversão de preço digitado, ordem de exibição e a
 * projeção pública. Esta última é a barreira que impede custo e estoque de
 * vazarem para a vitrine — se um campo não está na lista, não é público.
 */

export type ProductUnit = "UN" | "KG" | "CX" | "DZ";

export const PRODUCT_UNITS: ReadonlyArray<{ value: ProductUnit; label: string }> = [
  { value: "UN", label: "Unidade" },
  { value: "KG", label: "Quilo" },
  { value: "CX", label: "Caixa" },
  { value: "DZ", label: "Dúzia" },
];

export function isProductUnit(value: unknown): value is ProductUnit {
  return PRODUCT_UNITS.some((unit) => unit.value === value);
}

/**
 * Converte "12,50", "12.50", "R$ 12,50" ou "1.234,56" em centavos.
 * Retorna `null` para entrada inválida — nunca 0 por omissão, porque preço zero
 * é uma decisão comercial explícita, não um erro de digitação.
 */
export function parsePriceToCents(raw: string): number | null {
  const cleaned = raw
    .trim()
    .replace(/^R\$\s?/i, "")
    .replace(/\s/g, "");

  if (!cleaned) return null;

  // Formato brasileiro: ponto é separador de milhar, vírgula é decimal.
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;

  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  if (value > 1_000_000) return null; // teto sanitário: R$ 1 milhão

  return Math.round(value * 100);
}

export function nextSortOrder(existing: ReadonlyArray<number>): number {
  return existing.length === 0 ? 0 : Math.max(...existing) + 10;
}

/** Produto só pode ir à vitrine se está ativo, publicado pelo dono e tem preço. */
export function canPublishProduct(input: {
  isActive: boolean;
  priceCents: number;
}): boolean {
  return input.isActive && input.priceCents > 0;
}

export type PublicProductSource = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  priceCents: number;
  unit: string;
  imageKey: string | null;
  isAvailable: boolean;
  isActive: boolean;
  deletedAt: Date | null;
  categoryName?: string | null;
  categorySlug?: string | null;
};

export type PublicProduct = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  priceCents: number;
  unit: string;
  imageKey: string | null;
  categoryName: string | null;
  categorySlug: string | null;
};

/**
 * Projeção pública por lista de permissões. Qualquer campo novo em `products`
 * fica privado até ser adicionado aqui de propósito.
 */
export function toPublicProduct(row: PublicProductSource): PublicProduct | null {
  if (!row.isActive || !row.isAvailable || row.deletedAt) return null;
  if (row.priceCents <= 0) return null;

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    priceCents: row.priceCents,
    unit: row.unit,
    imageKey: row.imageKey,
    categoryName: row.categoryName ?? null,
    categorySlug: row.categorySlug ?? null,
  };
}

/** Agrupa produtos públicos por categoria, mantendo a ordem de exibição. */
export function groupByCategory(
  items: ReadonlyArray<PublicProduct>,
): Array<{ name: string; slug: string; products: PublicProduct[] }> {
  const groups = new Map<string, { name: string; slug: string; products: PublicProduct[] }>();

  for (const item of items) {
    const key = item.categorySlug ?? "__sem-categoria";
    const existing = groups.get(key);
    if (existing) {
      existing.products.push(item);
    } else {
      groups.set(key, {
        name: item.categoryName ?? "Outros",
        slug: item.categorySlug ?? "outros",
        products: [item],
      });
    }
  }

  return [...groups.values()];
}
