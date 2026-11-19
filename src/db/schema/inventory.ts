import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { uuidv7 } from "@/lib/id";
import { tenants } from "./tenancy";

/**
 * Estoque como livro-razão.
 *
 * O saldo (`stock_balances`) é consequência dos movimentos e é atualizado na
 * mesma transação do lançamento. Nenhuma tela escreve saldo diretamente: uma
 * correção é sempre um novo movimento de `ADJUSTMENT`.
 */

export const ingredients = pgTable(
  "ingredients",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    unit: text("unit").notNull().default("UN"), // UN | KG | G | L | ML | CX | DZ | PC
    /** Custo de referência por unidade, em centavos. */
    costPerUnitCents: integer("cost_per_unit_cents").notNull().default(0),
    /** Abaixo (ou igual) deste valor o insumo aparece como estoque baixo. */
    minStock: numeric("min_stock", { precision: 12, scale: 3 })
      .notNull()
      .default("0"),
    supplier: text("supplier"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("ingredients_tenant_id_key").on(t.tenantId, t.id),
    unique("ingredients_tenant_name_unit_key").on(t.tenantId, t.name, t.unit),
    index("ingredients_tenant_active_name_idx").on(t.tenantId, t.isActive, t.name),
    check("ingredients_cost_non_negative", sql`${t.costPerUnitCents} >= 0`),
    check("ingredients_min_stock_non_negative", sql`${t.minStock} >= 0`),
  ],
);

/**
 * Movimento de estoque: append-only. Não há `updated_at` nem `deleted_at` —
 * corrigir um lançamento significa registrar um novo `ADJUSTMENT`.
 *
 * `quantity` é sempre positiva; o sinal vem de `movement_type` (e, no ajuste,
 * de `adjustment_direction`). `item_type` é polimórfico (insumo na Fase 04,
 * produto acabado na Fase 05), por isso a validação de qual item existe fica no
 * serviço e a FK composta não se aplica.
 */
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    itemType: text("item_type").notNull(), // INGREDIENT | PRODUCT
    itemId: uuid("item_id").notNull(),
    movementType: text("movement_type").notNull(),
    /** Só em ADJUSTMENT: INCREASE soma, DECREASE subtrai. */
    adjustmentDirection: text("adjustment_direction"), // INCREASE | DECREASE
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
    /** Custo unitário no momento do lançamento (snapshot). */
    unitCostCents: integer("unit_cost_cents").notNull().default(0),
    /** Obrigatório em ADJUSTMENT e LOSS. */
    reason: text("reason"),
    referenceType: text("reference_type"),
    referenceId: uuid("reference_id"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("stock_movements_tenant_item_created_idx").on(
      t.tenantId,
      t.itemType,
      t.itemId,
      t.createdAt,
    ),
    index("stock_movements_tenant_created_idx").on(t.tenantId, t.createdAt),
    check(
      "stock_movements_item_type_valid",
      sql`${t.itemType} in ('INGREDIENT', 'PRODUCT')`,
    ),
    check(
      "stock_movements_type_valid",
      sql`${t.movementType} in (
        'IN', 'OUT', 'ADJUSTMENT', 'LOSS', 'PRODUCTION_CONSUMPTION', 'PRODUCTION_OUTPUT'
      )`,
    ),
    check("stock_movements_quantity_positive", sql`${t.quantity} > 0`),
    check("stock_movements_unit_cost_non_negative", sql`${t.unitCostCents} >= 0`),
    check(
      "stock_movements_reason_required",
      sql`${t.movementType} not in ('ADJUSTMENT', 'LOSS')
          or (${t.reason} is not null and length(btrim(${t.reason})) > 0)`,
    ),
    check(
      "stock_movements_adjustment_direction",
      sql`(${t.movementType} = 'ADJUSTMENT'
            and ${t.adjustmentDirection} in ('INCREASE', 'DECREASE'))
          or (${t.movementType} <> 'ADJUSTMENT' and ${t.adjustmentDirection} is null)`,
    ),
  ],
);

/** Saldo atual por item. PK composta: um saldo por (tenant, tipo, item). */
export const stockBalances = pgTable(
  "stock_balances",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    itemType: text("item_type").notNull(),
    itemId: uuid("item_id").notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull().default("0"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({
      name: "stock_balances_pkey",
      columns: [t.tenantId, t.itemType, t.itemId],
    }),
    index("stock_balances_tenant_type_idx").on(t.tenantId, t.itemType),
    check("stock_balances_item_type_valid", sql`${t.itemType} in ('INGREDIENT', 'PRODUCT')`),
    // O banco recusa saldo negativo mesmo se a aplicação errar a conta.
    check("stock_balances_quantity_non_negative", sql`${t.quantity} >= 0`),
  ],
);

export type Ingredient = typeof ingredients.$inferSelect;
export type NewIngredient = typeof ingredients.$inferInsert;
export type StockMovement = typeof stockMovements.$inferSelect;
export type StockBalance = typeof stockBalances.$inferSelect;
export type StockItemType = "INGREDIENT" | "PRODUCT";
