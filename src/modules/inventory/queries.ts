import { and, asc, desc, eq, like, sql } from "drizzle-orm";
import { withTenant } from "@/lib/db";
import { ingredients, products, stockBalances, stockMovements } from "@/db/schema";

export type IngredientRow = {
  id: string;
  name: string;
  unit: string;
  costPerUnitCents: number;
  minStock: string;
  supplier: string | null;
  isActive: boolean;
  quantity: string;
  updatedAt: Date;
};

const balanceByItem = () =>
  and(
    eq(stockBalances.tenantId, ingredients.tenantId),
    eq(stockBalances.itemType, "INGREDIENT"),
    eq(stockBalances.itemId, ingredients.id),
  );

/**
 * Lista insumos com o saldo atual. O filtro por tenant é redundante com o RLS
 * de propósito: se a política falhar, a consulta ainda não cruza tenants.
 */
export async function listIngredients(
  tenantId: string,
  filter: { search?: string; includeInactive?: boolean } = {},
): Promise<IngredientRow[]> {
  const search = filter.search?.trim();
  const escaped = search?.replace(/[\\%_]/g, (char) => `\\${char}`);

  return withTenant(tenantId, (tx) =>
    tx
      .select({
        id: ingredients.id,
        name: ingredients.name,
        unit: ingredients.unit,
        costPerUnitCents: ingredients.costPerUnitCents,
        minStock: ingredients.minStock,
        supplier: ingredients.supplier,
        isActive: ingredients.isActive,
        quantity: sql<string>`coalesce(${stockBalances.quantity}, 0)`,
        updatedAt: ingredients.updatedAt,
      })
      .from(ingredients)
      .leftJoin(stockBalances, balanceByItem())
      .where(
        and(
          eq(ingredients.tenantId, tenantId),
          filter.includeInactive ? undefined : eq(ingredients.isActive, true),
          escaped ? like(ingredients.name, `%${escaped}%`) : undefined,
        ),
      )
      .orderBy(desc(ingredients.isActive), asc(ingredients.name)),
  );
}

export async function getIngredient(
  tenantId: string,
  ingredientId: string,
): Promise<IngredientRow | null> {
  const [row] = await withTenant(tenantId, (tx) =>
    tx
      .select({
        id: ingredients.id,
        name: ingredients.name,
        unit: ingredients.unit,
        costPerUnitCents: ingredients.costPerUnitCents,
        minStock: ingredients.minStock,
        supplier: ingredients.supplier,
        isActive: ingredients.isActive,
        quantity: sql<string>`coalesce(${stockBalances.quantity}, 0)`,
        updatedAt: ingredients.updatedAt,
      })
      .from(ingredients)
      .leftJoin(stockBalances, balanceByItem())
      .where(and(eq(ingredients.tenantId, tenantId), eq(ingredients.id, ingredientId)))
      .limit(1),
  );

  return row ?? null;
}

export type MovementRow = {
  id: string;
  itemId: string;
  itemName: string | null;
  itemUnit: string | null;
  movementType: string;
  adjustmentDirection: string | null;
  quantity: string;
  unitCostCents: number;
  reason: string | null;
  createdAt: Date;
};

export type MovementPage = {
  rows: MovementRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export async function listMovements(
  tenantId: string,
  options: { page?: number; pageSize?: number; ingredientId?: string } = {},
): Promise<MovementPage> {
  const pageSize = Math.min(Math.max(options.pageSize ?? 20, 1), 100);
  const page = Math.max(options.page ?? 1, 1);

  const where = and(
    eq(stockMovements.tenantId, tenantId),
    options.ingredientId ? eq(stockMovements.itemId, options.ingredientId) : undefined,
  );

  return withTenant(tenantId, async (tx) => {
    const [countRow] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(stockMovements)
      .where(where);

    const rows = await tx
      .select({
        id: stockMovements.id,
        itemId: stockMovements.itemId,
        itemName: sql<string | null>`coalesce(${ingredients.name}, ${products.name})`,
        itemUnit: sql<string | null>`coalesce(${ingredients.unit}, ${products.unit})`,
        movementType: stockMovements.movementType,
        adjustmentDirection: stockMovements.adjustmentDirection,
        quantity: stockMovements.quantity,
        unitCostCents: stockMovements.unitCostCents,
        reason: stockMovements.reason,
        createdAt: stockMovements.createdAt,
      })
      .from(stockMovements)
      .leftJoin(
        ingredients,
        and(
          eq(ingredients.tenantId, stockMovements.tenantId),
          eq(ingredients.id, stockMovements.itemId),
        ),
      )
      .leftJoin(
        products,
        and(
          eq(products.tenantId, stockMovements.tenantId),
          eq(products.id, stockMovements.itemId),
        ),
      )
      .where(where)
      .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const total = countRow?.total ?? 0;

    return {
      rows,
      total,
      page,
      pageSize,
      pageCount: Math.max(Math.ceil(total / pageSize), 1),
    };
  });
}

export async function getBalance(
  tenantId: string,
  itemType: "INGREDIENT" | "PRODUCT",
  itemId: string,
): Promise<string> {
  const [row] = await withTenant(tenantId, (tx) =>
    tx
      .select({ quantity: stockBalances.quantity })
      .from(stockBalances)
      .where(
        and(
          eq(stockBalances.tenantId, tenantId),
          eq(stockBalances.itemType, itemType),
          eq(stockBalances.itemId, itemId),
        ),
      )
      .limit(1),
  );

  return row?.quantity ?? "0";
}
