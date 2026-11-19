import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { uuidv7 } from "@/lib/id";
import { tenants } from "./tenancy";
import { products } from "./catalog";
import { ingredients } from "./inventory";

/**
 * Produção.
 *
 * Ficha técnica (`recipes`) descreve quanto de cada insumo rende quantas
 * unidades do produto. A fornada (`production_batches`) só consome e dá entrada
 * no estoque ao ser concluída, na mesma transação que calcula o custo real.
 */

export const recipes = pgTable(
  "recipes",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull(),
    name: text("name").notNull(),
    /** Quanto o produto rende com a ficha inteira, na unidade informada. */
    yieldQuantity: numeric("yield_quantity", { precision: 12, scale: 3 }).notNull(),
    yieldUnit: text("yield_unit").notNull().default("UN"),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("recipes_tenant_id_key").on(t.tenantId, t.id),
    foreignKey({
      name: "recipes_tenant_product_fk",
      columns: [t.tenantId, t.productId],
      foreignColumns: [products.tenantId, products.id],
    }),
    index("recipes_tenant_active_idx").on(t.tenantId, t.isActive),
    index("recipes_tenant_product_idx").on(t.tenantId, t.productId),
    check("recipes_yield_positive", sql`${t.yieldQuantity} > 0`),
  ],
);

export const recipeItems = pgTable(
  "recipe_items",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    recipeId: uuid("recipe_id").notNull(),
    ingredientId: uuid("ingredient_id").notNull(),
    /** Quantidade da ficha inteira, na unidade do insumo. */
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
    unit: text("unit").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "recipe_items_tenant_recipe_fk",
      columns: [t.tenantId, t.recipeId],
      foreignColumns: [recipes.tenantId, recipes.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "recipe_items_tenant_ingredient_fk",
      columns: [t.tenantId, t.ingredientId],
      foreignColumns: [ingredients.tenantId, ingredients.id],
    }),
    unique("recipe_items_tenant_recipe_ingredient_key").on(
      t.tenantId,
      t.recipeId,
      t.ingredientId,
    ),
    index("recipe_items_tenant_recipe_idx").on(t.tenantId, t.recipeId),
    check("recipe_items_quantity_positive", sql`${t.quantity} > 0`),
  ],
);

export const productionBatches = pgTable(
  "production_batches",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    recipeId: uuid("recipe_id").notNull(),
    plannedQuantity: numeric("planned_quantity", { precision: 12, scale: 3 }).notNull(),
    /** Unidades boas efetivamente produzidas; nulo enquanto planejada. */
    producedQuantity: numeric("produced_quantity", { precision: 12, scale: 3 }),
    /** Custo real por unidade boa, calculado na conclusão. */
    unitCostCents: integer("unit_cost_cents").notNull().default(0),
    status: text("status").notNull().default("PLANNED"), // PLANNED | IN_PROGRESS | DONE | CANCELLED
    plannedAt: timestamp("planned_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    notes: text("notes"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("production_batches_tenant_id_key").on(t.tenantId, t.id),
    foreignKey({
      name: "production_batches_tenant_recipe_fk",
      columns: [t.tenantId, t.recipeId],
      foreignColumns: [recipes.tenantId, recipes.id],
    }),
    index("production_batches_tenant_status_idx").on(t.tenantId, t.status, t.plannedAt),
    check("production_batches_planned_positive", sql`${t.plannedQuantity} > 0`),
    check(
      "production_batches_produced_positive",
      sql`${t.producedQuantity} is null or ${t.producedQuantity} > 0`,
    ),
    check(
      "production_batches_status_valid",
      sql`${t.status} in ('PLANNED', 'IN_PROGRESS', 'DONE', 'CANCELLED')`,
    ),
    check("production_batches_unit_cost_non_negative", sql`${t.unitCostCents} >= 0`),
  ],
);

/** Perda registrada na conclusão da fornada. Append-only: prova de custo real. */
export const productionLosses = pgTable(
  "production_losses",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    batchId: uuid("batch_id").notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
    reason: text("reason").notNull(),
    costCents: integer("cost_cents").notNull().default(0),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "production_losses_tenant_batch_fk",
      columns: [t.tenantId, t.batchId],
      foreignColumns: [productionBatches.tenantId, productionBatches.id],
    }).onDelete("cascade"),
    index("production_losses_tenant_batch_idx").on(t.tenantId, t.batchId),
    check("production_losses_quantity_positive", sql`${t.quantity} > 0`),
    check("production_losses_cost_non_negative", sql`${t.costCents} >= 0`),
  ],
);

export type Recipe = typeof recipes.$inferSelect;
export type RecipeItem = typeof recipeItems.$inferSelect;
export type ProductionBatch = typeof productionBatches.$inferSelect;
export type ProductionLoss = typeof productionLosses.$inferSelect;
