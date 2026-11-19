import {
  bigint,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { uuidv7 } from "@/lib/id";

/**
 * Prova de diligência de backup. Backup sem `restore_tested_at` recente
 * aparece em destaque no painel global — backup não testado não conta.
 */
export const backupRuns = pgTable(
  "backup_runs",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    kind: text("kind").notNull(), // PITR_WINDOW | DUMP_TO_R2
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: text("status").notNull().default("RUNNING"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    storageKey: text("storage_key"),
    checksum: text("checksum"),
    error: text("error"),
    restoreTestedAt: timestamp("restore_tested_at", { withTimezone: true }),
    restoreTestedBy: text("restore_tested_by"),
  },
  (t) => [index("backup_runs_started_idx").on(t.startedAt)],
);

/** Resultado do cron de verificação de dependências externas. */
export const systemHealthChecks = pgTable(
  "system_health_checks",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    target: text("target").notNull(), // DB | GATEWAY | EMAIL | STORAGE | APP
    status: text("status").notNull(), // UP | DEGRADED | DOWN
    latencyMs: text("latency_ms"),
    detail: text("detail"),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("health_checks_target_checked_idx").on(t.target, t.checkedAt)],
);

/**
 * Tentativas negadas e comportamento suspeito. Distinto de `audit_logs`,
 * que registra o que foi ALTERADO.
 */
export const securityEvents = pgTable(
  "security_events",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: uuid("tenant_id"),
    type: text("type").notNull(),
    severity: text("severity").notNull().default("INFO"),
    actorId: text("actor_id"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    detail: jsonb("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("security_events_created_idx").on(t.createdAt),
    index("security_events_type_created_idx").on(t.type, t.createdAt),
  ],
);

export const platformIncidents = pgTable(
  "platform_incidents",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    title: text("title").notNull(),
    severity: text("severity").notNull().default("MINOR"),
    status: text("status").notNull().default("OPEN"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    summary: text("summary"),
    postmortem: text("postmortem"),
    createdBy: text("created_by"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("incidents_status_idx").on(t.status, t.startedAt)],
);

/** Flags operacionais (manutenção, modo de cobrança, limites globais). */
export const platformSettings = pgTable("platform_settings", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: jsonb("value").notNull(),
  description: text("description"),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Indica se o sistema aceita novos cadastros (ex.: durante manutenção). */
export const DEFAULT_PLATFORM_FLAGS = {
  signupEnabled: true,
  maintenanceMode: false,
  billingEnforcement: false,
  supportWhatsapp: "",
} as const;

export type PlatformFlagKey = keyof typeof DEFAULT_PLATFORM_FLAGS;

export const platformFlagDefaults = DEFAULT_PLATFORM_FLAGS;
