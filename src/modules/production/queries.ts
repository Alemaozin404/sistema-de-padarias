import { and, asc, desc, eq, sql } from "drizzle-orm";
import { withTenant } from "@/lib/db";
import {
  ingredients,
  productionBatches,
  productionLosses,
  products,
  recipeItems,
  recipes,
} from "@/db/schema";

export type RecipeRow = {
  id: string;
  name: string;
  productId: string;
  productName: string;
  yieldQuantity: string;
  yieldUnit: string;
  isActive: boolean;
  itemCount: number;
  /** Custo estimado da ficha inteira, com o custo atual dos insumos. */
  estimatedTotalCents: number;
};

export async function listRecipes(tenantId: string): Promise<RecipeRow[]> {
  return withTenant(tenantId, (tx) =>
    tx
      .select({
        id: recipes.id,
        name: recipes.name,
        productId: recipes.productId,
        productName: products.name,
        yieldQuantity: recipes.yieldQuantity,
        yieldUnit: recipes.yieldUnit,
        isActive: recipes.isActive,
        itemCount: sql<number>`count(${recipeItems.id})::int`,
        estimatedTotalCents: sql<number>`coalesce(sum(${recipeItems.quantity} * ${ingredients.costPerUnitCents}), 0)::int`,
      })
      .from(recipes)
      .innerJoin(
        products,
        and(eq(products.tenantId, recipes.tenantId), eq(products.id, recipes.productId)),
      )
      .leftJoin(
        recipeItems,
        and(
          eq(recipeItems.tenantId, recipes.tenantId),
          eq(recipeItems.recipeId, recipes.id),
        ),
      )
      .leftJoin(
        ingredients,
        and(
          eq(ingredients.tenantId, recipeItems.tenantId),
          eq(ingredients.id, recipeItems.ingredientId),
        ),
      )
      .where(eq(recipes.tenantId, tenantId))
      .groupBy(recipes.id, products.id)
      .orderBy(desc(recipes.isActive), asc(recipes.name)),
  );
}

export type RecipeItemRow = {
  id: string;
  ingredientId: string;
  ingredientName: string;
  ingredientUnit: string;
  quantity: string;
  unit: string;
  unitCostCents: number;
  isActive: boolean;
};

export type RecipeDetail = {
  id: string;
  name: string;
  productId: string;
  productName: string;
  yieldQuantity: string;
  yieldUnit: string;
  notes: string | null;
  isActive: boolean;
  items: RecipeItemRow[];
};

export async function getRecipe(
  tenantId: string,
  recipeId: string,
): Promise<RecipeDetail | null> {
  return withTenant(tenantId, async (tx) => {
    const [recipe] = await tx
      .select({
        id: recipes.id,
        name: recipes.name,
        productId: recipes.productId,
        productName: products.name,
        yieldQuantity: recipes.yieldQuantity,
        yieldUnit: recipes.yieldUnit,
        notes: recipes.notes,
        isActive: recipes.isActive,
      })
      .from(recipes)
      .innerJoin(
        products,
        and(eq(products.tenantId, recipes.tenantId), eq(products.id, recipes.productId)),
      )
      .where(and(eq(recipes.tenantId, tenantId), eq(recipes.id, recipeId)))
      .limit(1);

    if (!recipe) return null;

    const items = await tx
      .select({
        id: recipeItems.id,
        ingredientId: recipeItems.ingredientId,
        ingredientName: ingredients.name,
        ingredientUnit: ingredients.unit,
        quantity: recipeItems.quantity,
        unit: recipeItems.unit,
        unitCostCents: ingredients.costPerUnitCents,
        isActive: ingredients.isActive,
      })
      .from(recipeItems)
      .innerJoin(
        ingredients,
        and(
          eq(ingredients.tenantId, recipeItems.tenantId),
          eq(ingredients.id, recipeItems.ingredientId),
        ),
      )
      .where(
        and(eq(recipeItems.tenantId, tenantId), eq(recipeItems.recipeId, recipeId)),
      )
      .orderBy(asc(ingredients.name));

    return { ...recipe, items };
  });
}

export type BatchRow = {
  id: string;
  recipeId: string;
  recipeName: string;
  productName: string;
  plannedQuantity: string;
  producedQuantity: string | null;
  unitCostCents: number;
  status: string;
  plannedAt: Date;
  finishedAt: Date | null;
  notes: string | null;
};

export async function listBatches(tenantId: string): Promise<BatchRow[]> {
  return withTenant(tenantId, (tx) =>
    tx
      .select({
        id: productionBatches.id,
        recipeId: productionBatches.recipeId,
        recipeName: recipes.name,
        productName: products.name,
        plannedQuantity: productionBatches.plannedQuantity,
        producedQuantity: productionBatches.producedQuantity,
        unitCostCents: productionBatches.unitCostCents,
        status: productionBatches.status,
        plannedAt: productionBatches.plannedAt,
        finishedAt: productionBatches.finishedAt,
        notes: productionBatches.notes,
      })
      .from(productionBatches)
      .innerJoin(
        recipes,
        and(
          eq(recipes.tenantId, productionBatches.tenantId),
          eq(recipes.id, productionBatches.recipeId),
        ),
      )
      .innerJoin(
        products,
        and(eq(products.tenantId, recipes.tenantId), eq(products.id, recipes.productId)),
      )
      .where(eq(productionBatches.tenantId, tenantId))
      .orderBy(desc(productionBatches.plannedAt))
      .limit(50),
  );
}

export type BatchDetail = BatchRow & {
  recipeYield: string;
};

export async function getBatch(
  tenantId: string,
  batchId: string,
): Promise<BatchDetail | null> {
  const [row] = await withTenant(tenantId, (tx) =>
    tx
      .select({
        id: productionBatches.id,
        recipeId: productionBatches.recipeId,
        recipeName: recipes.name,
        productName: products.name,
        plannedQuantity: productionBatches.plannedQuantity,
        producedQuantity: productionBatches.producedQuantity,
        unitCostCents: productionBatches.unitCostCents,
        status: productionBatches.status,
        plannedAt: productionBatches.plannedAt,
        finishedAt: productionBatches.finishedAt,
        notes: productionBatches.notes,
        recipeYield: recipes.yieldQuantity,
      })
      .from(productionBatches)
      .innerJoin(
        recipes,
        and(
          eq(recipes.tenantId, productionBatches.tenantId),
          eq(recipes.id, productionBatches.recipeId),
        ),
      )
      .innerJoin(
        products,
        and(eq(products.tenantId, recipes.tenantId), eq(products.id, recipes.productId)),
      )
      .where(
        and(
          eq(productionBatches.tenantId, tenantId),
          eq(productionBatches.id, batchId),
        ),
      )
      .limit(1),
  );

  return row ?? null;
}

export async function listBatchLosses(tenantId: string, batchId: string) {
  return withTenant(tenantId, (tx) =>
    tx
      .select()
      .from(productionLosses)
      .where(
        and(
          eq(productionLosses.tenantId, tenantId),
          eq(productionLosses.batchId, batchId),
        ),
      )
      .orderBy(desc(productionLosses.createdAt)),
  );
}
