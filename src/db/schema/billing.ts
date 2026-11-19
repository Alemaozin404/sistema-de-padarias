import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { plans } from "./plans";
import { tenants } from "./tenancy";
import { uuidv7 } from "@/lib/id";

/**
 * Assinatura do estabelecimento. Guarda o preço contratado em snapshot:
 * mudar a tabela de planos não altera o que o cliente já paga.
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("PENDING"),
    priceCents: integer("price_cents").notNull(),
    activationFeeCents: integer("activation_fee_cents").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    nextDueDate: date("next_due_date"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    restrictedAt: timestamp("restricted_at", { withTimezone: true }),
    gatewayCustomerId: text("gateway_customer_id"),
    gatewaySubscriptionId: text("gateway_subscription_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // No máximo uma assinatura não encerrada por tenant.
    uniqueIndex("subscriptions_one_open_per_tenant")
      .on(t.tenantId)
      .where(sql`${t.status} <> 'CANCELLED'`),
    unique("subscriptions_gateway_subscription_key").on(t.gatewaySubscriptionId),
    index("subscriptions_status_due_idx").on(t.status, t.nextDueDate),
    check("subscriptions_price_non_negative", sql`${t.priceCents} >= 0`),
  ],
);

/** Toda transição de estado da assinatura é registrada com motivo e autor. */
export const subscriptionStatusHistory = pgTable(
  "subscription_status_history",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    reason: text("reason"),
    actorType: text("actor_type").notNull(), // USER | ADMIN | SYSTEM | GATEWAY
    actorId: text("actor_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("subscription_history_tenant_idx").on(t.tenantId, t.createdAt)],
);

/**
 * Fatura. O primeiro pagamento (INITIAL) soma mensalidade + ativação;
 * renovações (RENEWAL) cobram apenas a mensalidade.
 */
export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "restrict" }),
    kind: text("kind").notNull(), // INITIAL | RENEWAL
    status: text("status").notNull().default("OPEN"), // DRAFT|OPEN|PAID|OVERDUE|VOID|REFUNDED
    planAmountCents: integer("plan_amount_cents").notNull().default(0),
    activationAmountCents: integer("activation_amount_cents").notNull().default(0),
    discountCents: integer("discount_cents").notNull().default(0),
    fineCents: integer("fine_cents").notNull().default(0),
    interestCents: integer("interest_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),
    dueDate: date("due_date").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    gateway: text("gateway"),
    gatewayInvoiceId: text("gateway_invoice_id"),
    pixPayload: text("pix_payload"),
    pixExpiresAt: timestamp("pix_expires_at", { withTimezone: true }),
    invoiceUrl: text("invoice_url"),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("invoices_gateway_invoice_key").on(t.gatewayInvoiceId),
    // Uma assinatura não pode ter duas cobranças abertas ao mesmo tempo: o
    // reenvio de checkout e o cron de renovação disputam esta constraint.
    uniqueIndex("invoices_one_open_per_subscription")
      .on(t.subscriptionId)
      .where(sql`${t.status} in ('OPEN', 'OVERDUE')`),
    index("invoices_tenant_status_due_idx").on(t.tenantId, t.status, t.dueDate),
    index("invoices_status_due_idx").on(t.status, t.dueDate),
    check("invoices_total_non_negative", sql`${t.totalCents} >= 0`),
    check(
      "invoices_amounts_non_negative",
      sql`${t.planAmountCents} >= 0 AND ${t.activationAmountCents} >= 0 AND ${t.discountCents} >= 0 AND ${t.fineCents} >= 0 AND ${t.interestCents} >= 0`,
    ),
  ],
);

/**
 * Pagamento confirmado pelo gateway. `UNIQUE (gateway, gateway_payment_id)`
 * é o que impede cobrança/pagamento duplicado no nível do banco.
 */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "restrict" }),
    gateway: text("gateway").notNull(),
    gatewayPaymentId: text("gateway_payment_id").notNull(),
    method: text("method").notNull(), // PIX | CARD | BOLETO
    amountCents: integer("amount_cents").notNull(),
    status: text("status").notNull().default("PENDING"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    raw: jsonb("raw"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("payments_gateway_payment_key").on(t.gateway, t.gatewayPaymentId),
    index("payments_invoice_idx").on(t.invoiceId),
    check("payments_amount_non_negative", sql`${t.amountCents} >= 0`),
  ],
);

/**
 * Evento bruto do webhook. O endpoint apenas registra e responde 200;
 * `UNIQUE (gateway, event_id)` torna o reenvio inofensivo.
 */
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    gateway: text("gateway").notNull(),
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull().default("RECEIVED"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [
    unique("webhook_events_gateway_event_key").on(t.gateway, t.eventId),
    index("webhook_events_status_idx").on(t.status, t.receivedAt),
  ],
);

/** Configuração global de cobrança (linha única, id = 1). */
export const billingSettings = pgTable(
  "billing_settings",
  {
    id: integer("id").primaryKey().default(1),
    defaultActivationFeeCents: integer("default_activation_fee_cents").notNull(),
    finePercent: numeric("fine_percent", { precision: 5, scale: 2 }).notNull(),
    interestPercentMonth: numeric("interest_percent_month", { precision: 5, scale: 2 }).notNull(),
    dunningSchedule: jsonb("dunning_schedule").notNull(),
    restrictAfterDays: integer("restrict_after_days").notNull(),
    suspendAfterDays: integer("suspend_after_days").notNull(),
    cancelAfterDays: integer("cancel_after_days").notNull(),
    // Enquanto "false", a régua apenas avisa: não aplica multa nem suspende.
    enforceRestrictions: boolean("enforce_restrictions").notNull().default(false),
    updatedBy: text("updated_by"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("billing_settings_single_row", sql`${t.id} = 1`)],
);

/** Cupom promocional global. Nenhum desconto se aplica sem código/negociação registrada. */
export const coupons = pgTable(
  "coupons",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    code: varchar("code", { length: 40 }).notNull().unique(),
    discountType: text("discount_type").notNull(), // PERCENT | FIXED
    value: integer("value").notNull(),
    appliesToPlanId: uuid("applies_to_plan_id").references(() => plans.id, {
      onDelete: "set null",
    }),
    validFrom: timestamp("valid_from", { withTimezone: true }),
    validTo: timestamp("valid_to", { withTimezone: true }),
    maxRedemptions: integer("max_redemptions"),
    redemptions: integer("redemptions").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("coupons_value_positive", sql`${t.value} > 0`)],
);

/** Condição comercial negociada por cliente, com vigência e motivo registrados. */
export const tenantDiscounts = pgTable(
  "tenant_discounts",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    discountType: text("discount_type").notNull(),
    value: integer("value").notNull(),
    validFrom: date("valid_from").notNull(),
    validTo: date("valid_to"),
    reason: text("reason").notNull(),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tenant_discounts_tenant_idx").on(t.tenantId, t.validFrom),
    check("tenant_discounts_value_positive", sql`${t.value} > 0`),
  ],
);

/** Despesa operacional da própria empresa (painel global de rentabilidade). */
export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    description: text("description").notNull(),
    category: text("category").notNull(),
    amountCents: integer("amount_cents").notNull(),
    incurredAt: date("incurred_at").notNull(),
    recurring: boolean("recurring").notNull().default(false),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("expenses_incurred_idx").on(t.incurredAt),
    check("expenses_amount_non_negative", sql`${t.amountCents} >= 0`),
  ],
);

/** Registro de notificação da régua. `dedupe_key` garante um envio por evento. */
export const notificationLog = pgTable(
  "notification_log",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
    channel: text("channel").notNull(), // EMAIL | WHATSAPP_LINK | SMS
    template: text("template").notNull(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    status: text("status").notNull().default("SCHEDULED"),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    dedupeKey: text("dedupe_key").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notification_log_tenant_idx").on(t.tenantId, t.createdAt)],
);
