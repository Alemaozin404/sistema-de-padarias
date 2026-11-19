import { and, asc, desc, eq, isNull, like, sql } from "drizzle-orm";
import { getDb, withTenant } from "@/lib/db";
import { categories, productPriceHistory, products, tenants } from "@/db/schema";
import { toPublicProduct, type PublicProduct } from "./rules";

export type CatalogProduct = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  priceCents: number;
  unit: string;
  categoryId: string | null;
  categoryName: string | null;
  isActive: boolean;
  isAvailable: boolean;
  sortOrder: number;
  updatedAt: Date;
};

export async function listCategories(tenantId: string) {
  return withTenant(tenantId, (tx) =>
    tx
      .select()
      .from(categories)
      .where(eq(categories.tenantId, tenantId))
      .orderBy(asc(categories.sortOrder), asc(categories.name)),
  );
}

/**
 * Lista o catálogo interno. O filtro por `tenant_id` é redundante com o RLS de
 * propósito: se um dia a política falhar, a consulta ainda não cruza tenants.
 */
export async function listProducts(
  tenantId: string,
  filter: { search?: string; categoryId?: string } = {},
): Promise<CatalogProduct[]> {
  const search = filter.search?.trim();

  // `%` e `_` do usuário não devem funcionar como curinga.
  const escaped = search?.replace(/[\\%_]/g, (char) => `\\${char}`);

  return withTenant(tenantId, (tx) =>
    tx
      .select({
        id: products.id,
        name: products.name,
        slug: products.slug,
        description: products.description,
        priceCents: products.priceCents,
        unit: products.unit,
        categoryId: products.categoryId,
        categoryName: categories.name,
        isActive: products.isActive,
        isAvailable: products.isAvailable,
        sortOrder: products.sortOrder,
        updatedAt: products.updatedAt,
      })
      .from(products)
      .leftJoin(
        categories,
        and(eq(categories.tenantId, products.tenantId), eq(categories.id, products.categoryId)),
      )
      .where(
        and(
          eq(products.tenantId, tenantId),
          isNull(products.deletedAt),
          filter.categoryId ? eq(products.categoryId, filter.categoryId) : undefined,
          escaped ? like(products.name, `%${escaped}%`) : undefined,
        ),
      )
      .orderBy(asc(products.sortOrder), asc(products.name)),
  );
}

export async function getProduct(tenantId: string, productId: string) {
  const [row] = await withTenant(tenantId, (tx) =>
    tx
      .select()
      .from(products)
      .where(and(eq(products.tenantId, tenantId), eq(products.id, productId)))
      .limit(1),
  );
  return row ?? null;
}

export async function countProducts(tenantId: string): Promise<number> {
  const [row] = await withTenant(tenantId, (tx) =>
    tx
      .select({ total: sql<number>`count(*)::int` })
      .from(products)
      .where(and(eq(products.tenantId, tenantId), isNull(products.deletedAt))),
  );
  return row?.total ?? 0;
}

export async function listPriceHistory(tenantId: string, productId: string) {
  return withTenant(tenantId, (tx) =>
    tx
      .select()
      .from(productPriceHistory)
      .where(
        and(
          eq(productPriceHistory.tenantId, tenantId),
          eq(productPriceHistory.productId, productId),
        ),
      )
      .orderBy(desc(productPriceHistory.createdAt))
      .limit(20),
  );
}

/** Todos os slugs já usados no tenant — base para gerar slug único. */
export async function listTakenSlugs(tenantId: string): Promise<string[]> {
  const rows = await withTenant(tenantId, (tx) =>
    tx.select({ slug: products.slug }).from(products).where(eq(products.tenantId, tenantId)),
  );
  return rows.map((row) => row.slug);
}

/* -------------------------------------------------------------------------- */
/* Vitrine pública                                                            */
/* -------------------------------------------------------------------------- */

export type PublicTenant = {
  id: string;
  slug: string;
  tradeName: string;
  whatsapp: string | null;
  logoKey: string | null;
  brandColor: string | null;
};

/**
 * Estabelecimento publicado. `tenants` é tabela global (sem RLS), mas só
 * devolvemos o necessário para a vitrine — nunca documento, e-mail ou status
 * financeiro.
 */
export async function getPublicTenant(slug: string): Promise<PublicTenant | null> {
  const [row] = await getDb()
    .select({
      id: tenants.id,
      slug: tenants.slug,
      tradeName: tenants.tradeName,
      whatsapp: tenants.whatsapp,
      logoKey: tenants.logoKey,
      brandColor: tenants.brandColor,
      status: tenants.status,
    })
    .from(tenants)
    .where(and(eq(tenants.slug, slug), isNull(tenants.deletedAt)))
    .limit(1);

  if (!row || row.status !== "ACTIVE") return null;

  return {
    id: row.id,
    slug: row.slug,
    tradeName: row.tradeName,
    whatsapp: row.whatsapp,
    logoKey: row.logoKey,
    brandColor: row.brandColor,
  };
}

/**
 * Catálogo público: usa o mesmo `withTenant`, então um erro de filtro não vira
 * vazamento entre estabelecimentos. A projeção pública remove custo e estoque.
 */
export async function getPublicCatalog(tenantId: string): Promise<PublicProduct[]> {
  const rows = await withTenant(tenantId, (tx) =>
    tx
      .select({
        id: products.id,
        name: products.name,
        slug: products.slug,
        description: products.description,
        priceCents: products.priceCents,
        unit: products.unit,
        imageKey: products.imageKey,
        isAvailable: products.isAvailable,
        isActive: products.isActive,
        deletedAt: products.deletedAt,
        categoryName: categories.name,
        categorySlug: categories.slug,
      })
      .from(products)
      .leftJoin(
        categories,
        and(eq(categories.tenantId, products.tenantId), eq(categories.id, products.categoryId)),
      )
      .where(
        and(
          eq(products.tenantId, tenantId),
          isNull(products.deletedAt),
          eq(products.isActive, true),
          eq(products.isAvailable, true),
        ),
      )
      .orderBy(asc(categories.sortOrder), asc(products.sortOrder), asc(products.name)),
  );

  return rows
    .map((row) => toPublicProduct(row))
    .filter((row): row is PublicProduct => row !== null);
}
