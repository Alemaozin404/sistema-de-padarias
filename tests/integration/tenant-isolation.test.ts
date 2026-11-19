import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { getDb, withTenant } from "@/lib/db";
import { invoices, plans, subscriptions, tenants } from "@/db/schema";
import { uuidv7 } from "@/lib/id";

/**
 * Teste de isolamento multi-tenant contra PostgreSQL real.
 *
 * Sem DATABASE_URL a suíte é PULADA (nunca marcada como aprovada). Requer
 * migrations e políticas aplicadas:
 *   npm run db:migrate && npm run db:policies && npm run db:seed
 *
 * RLS mockado não prova nada: o valor do teste está em rodar no banco.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)("isolamento entre estabelecimentos", () => {
  const tenantA = uuidv7();
  const tenantB = uuidv7();
  let planId: string;
  let db: ReturnType<typeof getDb>;

  beforeAll(async () => {
    // Inicialização preguiçosa: sem DATABASE_URL este bloco nem roda.
    db = getDb();
    const [plan] = await db.select({ id: plans.id }).from(plans).limit(1);
    if (!plan) {
      throw new Error(
        "Nenhum plano encontrado. Rode `npm run db:seed` antes dos testes de integração.",
      );
    }
    planId = plan.id;

    await db.insert(tenants).values([
      { id: tenantA, slug: `teste-a-${tenantA.slice(0, 8)}`, tradeName: "Padaria A" },
      { id: tenantB, slug: `teste-b-${tenantB.slice(0, 8)}`, tradeName: "Padaria B" },
    ]);

    // Fatura real do tenant B, com preço de referência do plano.
    await withTenant(tenantB, async (tx) => {
      const [subscription] = await tx
        .insert(subscriptions)
        .values({
          tenantId: tenantB,
          planId,
          status: "ACTIVE",
          priceCents: 3990,
          activationFeeCents: 3990,
        })
        .returning({ id: subscriptions.id });

      if (!subscription) throw new Error("Falha ao criar assinatura de teste");

      await tx.insert(invoices).values({
        tenantId: tenantB,
        subscriptionId: subscription.id,
        kind: "INITIAL",
        status: "OPEN",
        planAmountCents: 3990,
        activationAmountCents: 3990,
        totalCents: 7980,
        dueDate: "2026-12-10",
      });
    });
  });

  afterAll(async () => {
    // tenants não têm RLS; o cascade remove filhas.
    await db.delete(tenants).where(sql`${tenants.id} in (${tenantA}, ${tenantB})`);
  });

  it("tenant A não enxerga fatura de B", async () => {
    const rows = await withTenant(tenantA, (tx) => tx.select().from(invoices));
    expect(rows).toHaveLength(0);
  });

  it("tenant B enxerga a própria fatura", async () => {
    const rows = await withTenant(tenantB, (tx) => tx.select().from(invoices));
    expect(rows).toHaveLength(1);
  });

  it("sem contexto de tenant, nenhuma linha é retornada", async () => {
    const rows = await db.select().from(invoices);
    expect(rows).toHaveLength(0);
  });

  it("tenant A não consegue gravar fatura em nome de B", async () => {
    await expect(
      withTenant(tenantA, async (tx) => {
        const [subscription] = await tx
          .select({ id: subscriptions.id })
          .from(subscriptions)
          .limit(1);

        // A própria assinatura de B também está invisível para A.
        expect(subscription).toBeUndefined();

        await tx.insert(invoices).values({
          tenantId: tenantB,
          subscriptionId: uuidv7(),
          kind: "RENEWAL",
          status: "OPEN",
          totalCents: 3990,
          dueDate: "2027-01-10",
        });
      }),
    ).rejects.toThrow();
  });

  it("tenant_id é imutável", async () => {
    await expect(
      withTenant(tenantB, async (tx) => {
        await tx
          .update(invoices)
          .set({ tenantId: tenantA })
          .where(eq(invoices.tenantId, tenantB));
      }),
    ).rejects.toThrow();
  });

  it("limite de plano nunca conta dado de outro tenant", async () => {
    const countA = await withTenant(tenantA, async (tx) => {
      const [row] = await tx.select({ total: sql<number>`count(*)::int` }).from(invoices);
      return row?.total ?? -1;
    });
    const countB = await withTenant(tenantB, async (tx) => {
      const [row] = await tx.select({ total: sql<number>`count(*)::int` }).from(invoices);
      return row?.total ?? -1;
    });

    expect(countA).toBe(0);
    expect(countB).toBe(1);
  });
});
