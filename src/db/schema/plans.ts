import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { uuidv7 } from "@/lib/id";

/**
 * Catálogo de chaves de permissão (ex.: "products.max").
 * Editar aqui é operação do painel global, sem deploy.
 */
export const featureDefinitions = pgTable("feature_definitions", {
  key: varchar("key", { length: 64 }).primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  valueType: text("value_type").notNull(), // BOOLEAN | LIMIT | UNLIMITED
  unitLabel: text("unit_label"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Plano comercial. O preço é sempre em centavos inteiros.
 * Alterar `price_cents` vale para novas assinaturas; a assinatura guarda o
 * preço contratado em snapshot.
 */
export const plans = pgTable(
  "plans",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    code: varchar("code", { length: 32 }).notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    priceCents: integer("price_cents").notNull(),
    activationFeeCents: integer("activation_fee_cents").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    isFeatured: boolean("is_featured").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    trialDays: integer("trial_days").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("plans_price_non_negative", sql`${t.priceCents} >= 0`),
    check("plans_activation_non_negative", sql`${t.activationFeeCents} >= 0`),
  ],
);

/** Habilita uma feature em um plano, com limite opcional (NULL = sem teto). */
export const planFeatures = pgTable(
  "plan_features",
  {
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    featureKey: varchar("feature_key", { length: 64 })
      .notNull()
      .references(() => featureDefinitions.key, { onDelete: "restrict" }),
    isEnabled: boolean("is_enabled").notNull().default(false),
    limitValue: integer("limit_value"),
  },
  (t) => [primaryKey({ columns: [t.planId, t.featureKey] })],
);
