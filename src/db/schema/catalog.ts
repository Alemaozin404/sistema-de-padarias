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

/**
 * Catálogo do estabelecimento.
 *
 * Toda tabela carrega `tenant_id` e FK composta `(tenant_id, ...)`: além do RLS,
 * o banco recusa fisicamente ligar um produto a uma categoria de outro
 * estabelecimento. Defesa em profundidade — nenhuma das duas sozinha basta.
 */

export const categories = pgTable(
  "categories",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Alvo da FK composta das filhas.
    unique("categories_tenant_id_key").on(t.tenantId, t.id),
    unique("categories_tenant_slug_key").on(t.tenantId, t.slug),
    index("categories_tenant_sort_idx").on(t.tenantId, t.sortOrder),
  ],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id"),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    priceCents: integer("price_cents").notNull(),
    unit: text("unit").notNull().default("UN"), // UN | KG | CX | DZ
    sku: text("sku"),
    imageKey: text("image_key"),
    /** Aparece no catálogo interno. */
    isActive: boolean("is_active").notNull().default(true),
    /** Aparece na vitrine pública. */
    isAvailable: boolean("is_available").notNull().default(false),
    /** Reservado para a baixa automática de estoque (Fase 04). */
    trackStock: boolean("track_stock").notNull().default(false),
    minStock: numeric("min_stock", { precision: 12, scale: 3 }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    /** Soft delete: histórico de venda e custo nunca perde o produto. */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    unique("products_tenant_id_key").on(t.tenantId, t.id),
    unique("products_tenant_slug_key").on(t.tenantId, t.slug),
    foreignKey({
      name: "products_tenant_category_fk",
      columns: [t.tenantId, t.categoryId],
      foreignColumns: [categories.tenantId, categories.id],
    }),
    index("products_tenant_active_name_idx").on(t.tenantId, t.isActive, t.name),
    index("products_tenant_category_idx").on(t.tenantId, t.categoryId),
    check("products_price_non_negative", sql`${t.priceCents} >= 0`),
    check("products_slug_format", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
  ],
);

export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull(),
    storageKey: text("storage_key").notNull(),
    alt: text("alt"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "product_images_tenant_product_fk",
      columns: [t.tenantId, t.productId],
      foreignColumns: [products.tenantId, products.id],
    }).onDelete("cascade"),
    index("product_images_tenant_product_idx").on(t.tenantId, t.productId, t.sortOrder),
  ],
);

/**
 * Histórico de preço: append-only. O preço atual vive em `products`, e cada
 * alteração deixa rastro com autor — nunca editável pela aplicação.
 */
export const productPriceHistory = pgTable(
  "product_price_history",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull(),
    oldPriceCents: integer("old_price_cents").notNull(),
    newPriceCents: integer("new_price_cents").notNull(),
    changedBy: text("changed_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "price_history_tenant_product_fk",
      columns: [t.tenantId, t.productId],
      foreignColumns: [products.tenantId, products.id],
    }).onDelete("cascade"),
    index("price_history_tenant_product_idx").on(t.tenantId, t.productId, t.createdAt),
    check("price_history_old_non_negative", sql`${t.oldPriceCents} >= 0`),
    check("price_history_new_non_negative", sql`${t.newPriceCents} >= 0`),
  ],
);

export type Product = typeof products.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type NewCategory = typeof categories.$inferInsert;
export type ProductUnit = "UN" | "KG" | "CX" | "DZ";
