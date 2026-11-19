import { and, asc, eq, sql } from "drizzle-orm";
import { getDb, withTenant } from "@/lib/db";
import { memberships, tenants } from "@/db/schema";

export type MyMembership = {
  tenantId: string;
  role: "OWNER" | "MANAGER" | "STAFF";
  tradeName: string;
  slug: string;
  tenantStatus: string;
};

/**
 * Estabelecimentos do usuário logado. A política de `memberships` libera as
 * linhas com `user_id = app.user_id`; `tenants` é global.
 */
export async function listMyMemberships(userId: string): Promise<MyMembership[]> {
  const db = getDb();

  const rows = await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return tx
      .select({
        tenantId: memberships.tenantId,
        role: memberships.role,
        tradeName: tenants.tradeName,
        slug: tenants.slug,
        tenantStatus: tenants.status,
      })
      .from(memberships)
      .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
      .where(
        and(eq(memberships.userId, userId), eq(memberships.status, "ACTIVE")),
      )
      .orderBy(asc(tenants.tradeName));
  });

  return rows.map((row) => ({ ...row, role: row.role as MyMembership["role"] }));
}

/** Confirma que o usuário realmente pertence ao tenant antes de trocar o contexto. */
export async function findMembership(userId: string, tenantId: string) {
  const rows = await withTenant(tenantId, (tx) =>
    tx
      .select({ id: memberships.id, role: memberships.role, status: memberships.status })
      .from(memberships)
      .where(
        and(eq(memberships.userId, userId), eq(memberships.tenantId, tenantId)),
      )
      .limit(1),
  );

  return rows[0] ?? null;
}
