import { boolean, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { uuidv7 } from "@/lib/id";

/**
 * Tabelas de autenticação no formato exigido pelo Better Auth
 * (nomes de tabela e coluna são contrato da biblioteca, não escolha nossa).
 * Campos extras de negócio vivem em tabelas próprias (memberships, platform_admins).
 */

export const user = pgTable(
  "user",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    // Status administrativo do usuário; independe do vínculo com o tenant.
    status: text("status").notNull().default("ACTIVE"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("user_email_idx").on(t.email)],
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    // Tenant ativo da sessão: toda requisição autenticada escolhe UM estabelecimento.
    activeTenantId: text("active_tenant_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

/**
 * Realm separado do painel global. Nenhum usuário de padaria é admin de plataforma,
 * mesmo sendo OWNER do próprio tenant.
 */
export const platformAdmins = pgTable(
  "platform_admins",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("SUPPORT"), // OWNER | SUPPORT
    mfaRequired: boolean("mfa_required").notNull().default(true),
    isActive: boolean("is_active").notNull().default(true),
    // Segredo TOTP cifrado com AES-256-GCM (chave derivada de BETTER_AUTH_SECRET).
    totpSecret: text("totp_secret"),
    totpEnabledAt: timestamp("totp_enabled_at", { withTimezone: true }),
    totpLastStep: integer("totp_last_step"),
    lastMfaAt: timestamp("last_mfa_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("platform_admins_role_idx").on(t.role)],
);

/**
 * Sessão do realm de plataforma. Cookie e token são independentes da sessão da
 * padaria: um usuário comum não herda acesso ao /admin só por estar logado.
 * O token só é guardado como hash; `mfaVerifiedAt` só é preenchido após o TOTP.
 */
export const platformSessions = pgTable(
  "platform_sessions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    mfaVerifiedAt: timestamp("mfa_verified_at", { withTimezone: true }),
    lastReauthAt: timestamp("last_reauth_at", { withTimezone: true }),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("platform_sessions_user_idx").on(t.userId),
    index("platform_sessions_expires_idx").on(t.expiresAt),
  ],
);
