import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { uuidv7 } from "@/lib/id";

/**
 * Estabelecimento (padaria). É a raiz do isolamento multi-tenant.
 * O `status` aqui é administrativo (a plataforma suspendeu o cliente);
 * o status financeiro vive em `subscriptions`.
 */
export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    slug: text("slug").notNull().unique(),
    legalName: text("legal_name"),
    tradeName: text("trade_name").notNull(),
    document: text("document"),
    email: text("email"),
    phone: text("phone"),
    whatsapp: text("whatsapp"),
    logoKey: text("logo_key"),
    brandColor: text("brand_color"),
    timezone: text("timezone").notNull().default("America/Sao_Paulo"),
    status: text("status").notNull().default("ACTIVE"), // ACTIVE | SUSPENDED | CLOSED
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("tenants_status_idx").on(t.status)],
);

/**
 * Vínculo entre usuário e estabelecimento. Um usuário pode atender mais de uma
 * padaria (ex.: contador), mas cada requisição opera em um único tenant.
 */
export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("STAFF"), // OWNER | MANAGER | STAFF
    status: text("status").notNull().default("ACTIVE"), // ACTIVE | DISABLED
    invitedBy: text("invited_by"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("memberships_user_tenant_key").on(t.userId, t.tenantId),
    index("memberships_tenant_role_idx").on(t.tenantId, t.role),
  ],
);

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull().default("STAFF"),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("invitations_tenant_idx").on(t.tenantId)],
);

/** Trilha de auditoria: somente inserção, nunca update/delete pela aplicação. */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    actorType: text("actor_type").notNull(), // USER | ADMIN | SYSTEM | GATEWAY
    actorId: text("actor_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_tenant_created_idx").on(t.tenantId, t.createdAt),
    index("audit_logs_actor_idx").on(t.actorType, t.actorId),
  ],
);
