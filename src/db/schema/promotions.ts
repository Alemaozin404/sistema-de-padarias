import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { coupons, subscriptions } from "./billing";
import { plans } from "./plans";
import { tenants } from "./tenancy";
import { user } from "./auth";
import { uuidv7 } from "@/lib/id";

export const subscriptionGrants = pgTable(
  "subscription_grants",
  {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id, { onDelete: "cascade" }),
    sourceType: text("source_type").notNull(), // COUPON | SECRET_KEY | MANUAL
    sourceId: uuid("source_id"),
    planId: uuid("plan_id").references(() => plans.id, { onDelete: "set null" }),
    grantType: text("grant_type").notNull(), // PERCENT | FIXED | FREE | ACTIVATION
    value: integer("value").notNull().default(0),
    waiveActivationFee: boolean("waive_activation_fee").notNull().default(false),
    durationCycles: integer("duration_cycles"), // null = vitalício
    cyclesUsed: integer("cycles_used").notNull().default(0),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    status: text("status").notNull().default("ACTIVE"), // ACTIVE | EXPIRED | REVOKED | CONSUMED
    createdBy: text("created_by"),
    revokedBy: text("revoked_by"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("subscription_grants_tenant_idx").on(t.tenantId, t.status),
    index("subscription_grants_subscription_idx").on(t.subscriptionId, t.status),
  ],
);

export const couponRedemptions = pgTable(
  "coupon_redemptions",
  {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
    couponId: uuid("coupon_id")
      .notNull()
      .references(() => coupons.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    grantId: uuid("grant_id").references(() => subscriptionGrants.id, { onDelete: "set null" }),
    invoiceId: uuid("invoice_id"),
    originalAmountCents: integer("original_amount_cents").notNull().default(0),
    discountCents: integer("discount_cents").notNull().default(0),
    finalAmountCents: integer("final_amount_cents").notNull().default(0),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("coupon_redemptions_coupon_idx").on(t.couponId, t.redeemedAt),
    index("coupon_redemptions_tenant_idx").on(t.tenantId, t.redeemedAt),
  ],
);

export const secretKeys = pgTable(
  "secret_keys",
  {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
    codeHash: text("code_hash").notNull().unique(),
    codePrefix: varchar("code_prefix", { length: 16 }).notNull(),
    name: text("name"),
    planId: uuid("plan_id").references(() => plans.id, { onDelete: "set null" }),
    anyPlan: boolean("any_plan").notNull().default(false),
    grantType: text("grant_type").notNull().default("FREE"), // PERCENT | FIXED | FREE | ACTIVATION
    value: integer("value").notNull().default(100),
    waiveActivationFee: boolean("waive_activation_fee").notNull().default(true),
    durationDays: integer("duration_days"),
    durationCycles: integer("duration_cycles"),
    lifetime: boolean("lifetime").notNull().default(false),
    maxRedemptions: integer("max_redemptions").notNull().default(1),
    redemptions: integer("redemptions").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    status: text("status").notNull().default("ACTIVE"), // ACTIVE | REVOKED | EXPIRED
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("secret_keys_status_idx").on(t.status, t.createdAt)],
);

export const secretKeyRedemptions = pgTable(
  "secret_key_redemptions",
  {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
    secretKeyId: uuid("secret_key_id")
      .notNull()
      .references(() => secretKeys.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    grantId: uuid("grant_id").references(() => subscriptionGrants.id, { onDelete: "set null" }),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("secret_key_redemptions_key_tenant_key").on(t.secretKeyId, t.tenantId),
    index("secret_key_redemptions_tenant_idx").on(t.tenantId, t.redeemedAt),
  ],
);

export const promotionCampaigns = pgTable(
  "promotion_campaigns",
  {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
    name: text("name").notNull(),
    description: text("description"),
    couponId: uuid("coupon_id").references(() => coupons.id, { onDelete: "set null" }),
    secretKeyId: uuid("secret_key_id").references(() => secretKeys.id, { onDelete: "set null" }),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("promotion_campaigns_created_idx").on(t.createdAt)],
);

export const promotionRecipients = pgTable(
  "promotion_recipients",
  {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => promotionCampaigns.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("SENT"), // SENT | REDEEMED | EXPIRED
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
  },
  (t) => [unique("promotion_recipients_campaign_tenant_key").on(t.campaignId, t.tenantId)],
);

export const promotionAuditLogs = pgTable(
  "promotion_audit_logs",
  {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("promotion_audit_logs_created_idx").on(t.createdAt)],
);
