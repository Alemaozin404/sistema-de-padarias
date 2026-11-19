import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { serverEnv } from "@/lib/env";

export type Database = PostgresJsDatabase<typeof schema>;

/**
 * Uma única instância por processo. Em desenvolvimento o Next recarrega módulos,
 * então guardamos no globalThis para não abrir um pool por reload.
 */
const globalForDb = globalThis as unknown as {
  __sql?: ReturnType<typeof postgres>;
  __db?: Database;
};

function createClient() {
  const env = serverEnv();
  return postgres(env.DATABASE_URL, {
    max: 5, // serverless: pool pequeno, o Neon faz o pooling real
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false, // obrigatório com pooler em modo transaction
  });
}

export function getClient(): ReturnType<typeof postgres> {
  if (!globalForDb.__sql) globalForDb.__sql = createClient();
  return globalForDb.__sql;
}

/** Conexão sem contexto de tenant: apenas tabelas globais e jobs. */
export function getDb(): Database {
  if (!globalForDb.__db) globalForDb.__db = drizzle(getClient(), { schema, casing: "snake_case" });
  return globalForDb.__db;
}

/**
 * Executa `fn` dentro de uma transação com `app.tenant_id` definido localmente.
 * `set_config(..., true)` é o equivalente parametrizado de `SET LOCAL`: vale só
 * nesta transação e não vaza para outra requisição que reutilize a conexão.
 *
 * As políticas RLS comparam `tenant_id` com esse valor. Sem o contexto, toda
 * consulta em tabela de negócio retorna zero linhas — negar por padrão.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (tx: Database) => Promise<T>,
): Promise<T> {
  assertUuid(tenantId, "tenantId");

  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx as unknown as Database);
  });
}

/**
 * Contexto do realm de plataforma. Só é definido por server actions depois de
 * validar sessão + TOTP + reautenticação. Libera a leitura global de auditoria
 * e nunca é aceito como entrada do cliente.
 */
export async function withPlatformAdmin<T>(
  adminId: string,
  fn: (tx: Database) => Promise<T>,
): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.platform_admin_id', ${adminId}, true)`);
    return fn(tx as unknown as Database);
  });
}

/**
 * Contexto mínimo para o convidado ler o próprio convite antes de ter vínculo.
 * A política de `invitations` aceita o hash do token como credencial: quem tem o
 * link tem o hash, e nada além daquele convite fica visível.
 */
export async function withInviteToken<T>(
  tokenHash: string,
  fn: (tx: Database) => Promise<T>,
): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.invite_token_hash', ${tokenHash}, true)`);
    return fn(tx as unknown as Database);
  });
}

/** Leitura pública (vitrine): não usa o contexto da aplicação. */
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

export function assertUuid(value: string, field: string): void {
  if (!isUuid(value)) {
    throw new Error(`${field} inválido: esperado UUID`);
  }
}
