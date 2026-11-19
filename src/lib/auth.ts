import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { and, eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "@/lib/db";
import { AuthError } from "@/lib/errors";
import { escapeHtml, sendEmail } from "@/lib/email";
import { serverEnv } from "@/lib/env";
import { uuidv7 } from "@/lib/id";
import {
  account,
  memberships,
  session as sessionTable,
  user,
  verification,
} from "@/db/schema";

/**
 * Instância única e preguiçosa: o build não exige segredos, e a primeira
 * requisição valida o ambiente com mensagem clara.
 */
function createAuth() {
  const env = serverEnv();

  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.BETTER_AUTH_URL],
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: { user, session: sessionTable, account, verification },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      requireEmailVerification: false, // verificação entra com o provedor de e-mail (Fase 06)
      autoSignIn: true,
      // A redefinição falha com erro claro enquanto o e-mail não estiver configurado.
      resetPasswordTokenExpiresIn: 60 * 60,
      sendResetPassword: async ({ user, url }) => {
        const safeName = escapeHtml(user.name);
        await sendEmail({
          to: user.email,
          subject: "Redefinir senha — Gestão para padarias",
          text: `Olá, ${user.name}.\n\nPara criar uma nova senha, acesse: ${url}\n\nO link expira em 1 hora. Se você não pediu esta alteração, ignore este e-mail.`,
          html: `<p>Olá, ${safeName}.</p><p>Para criar uma nova senha, <a href="${url}">clique aqui</a>.</p><p>O link expira em 1 hora. Se você não pediu esta alteração, ignore este e-mail.</p>`,
        });
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    advanced: {
      database: { generateId: () => uuidv7() },
      useSecureCookies: process.env.NODE_ENV === "production",
    },
    // Deve ser o último plugin: permite definir cookies em Server Actions.
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;

let instance: Auth | null = null;

/** Instância única, criada na primeira requisição. */
export function getAuth(): Auth {
  if (instance) return instance;
  const created = createAuth();
  instance = created;
  return created;
}

export type AuthSession = Awaited<ReturnType<Auth["api"]["getSession"]>>;

/** Sessão atual a partir dos cookies da requisição. Nunca confia em input do cliente. */
export async function getSession(): Promise<AuthSession> {
  return getAuth().api.getSession({ headers: await headers() });
}

export type ActiveMembership = {
  tenantId: string;
  userId: string;
  role: "OWNER" | "MANAGER" | "STAFF";
  email: string;
  name: string;
};

export { AuthError } from "@/lib/errors";

/**
 * Resolve o tenant ativo da sessão.
 *
 * A lista de vínculos é lida com `app.user_id` definido, e a política RLS de
 * `memberships` permite apenas as linhas do próprio usuário. O tenant NUNCA vem
 * de query string, body ou header enviado pelo cliente — só da sessão assinada
 * e do vínculo confirmado no banco.
 */
export async function requireTenant(
  allowedRoles?: ReadonlyArray<ActiveMembership["role"]>,
): Promise<ActiveMembership> {
  const current = await getSession();
  if (!current?.user) {
    throw new AuthError("UNAUTHENTICATED", "Sessão expirada ou inexistente.");
  }

  const db = getDb();

  // Contexto de usuário para a política de memberships (vale só na transação).
  const rows = await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${current.user.id}, true)`);
    return tx
      .select({ tenantId: memberships.tenantId, role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.userId, current.user.id), eq(memberships.status, "ACTIVE")));
  });

  const [sessionRow] = await db
    .select({ activeTenantId: sessionTable.activeTenantId })
    .from(sessionTable)
    .where(eq(sessionTable.id, current.session.id))
    .limit(1);

  const active =
    rows.find((row) => row.tenantId === sessionRow?.activeTenantId) ?? rows[0];
  if (!active) {
    throw new AuthError("NO_TENANT", "Nenhum estabelecimento vinculado a este usuário.");
  }

  const role = active.role as ActiveMembership["role"];
  if (allowedRoles && !allowedRoles.includes(role)) {
    throw new AuthError("FORBIDDEN", "Seu perfil não tem permissão para esta operação.");
  }

  return {
    tenantId: active.tenantId,
    userId: current.user.id,
    role,
    email: current.user.email,
    name: current.user.name,
  };
}

/**
 * Realm separado do painel global: cookie e sessão próprios, com TOTP já
 * confirmado. Nenhuma sessão de padaria é aceita aqui.
 */
export async function requirePlatformAdmin() {
  const { requirePlatformAdminSession } = await import("@/lib/platform-auth");
  const session = await requirePlatformAdminSession();
  return { userId: session.userId, role: session.role };
}
