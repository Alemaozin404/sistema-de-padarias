import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb, withTenant, type Database } from "@/lib/db";
import { uuidv7 } from "@/lib/id";
import {
  auditLogs,
  invoices,
  plans,
  subscriptions,
  subscriptionUpgrades,
  tenants,
} from "@/db/schema";
import {
  BillingError,
  type InvoiceRow,
  ensureChargeForInvoice,
  getInvoice,
} from "./service";
import { isGatewayConfigured } from "./gateway";

export type UpgradeStatus =
  | "PENDING_PAYMENT"
  | "CONFIRMED"
  | "FAILED"
  | "CANCELLED";

export type UpgradeQuote = {
  fromPlanId: string;
  fromPriceCents: number;
  toPlanId: string;
  toPriceCents: number;
  originalAmountCents: number;
  discountPercent: number;
  discountAmountCents: number;
  finalAmountCents: number;
  entryAmountCents: number;
  remainingAmountCents: number;
};

export const UPGRADE_DISCOUNT_PERCENT = 25;

/** Calcula a cotação do upgrade no backend (não confia no frontend). */
export function calculateUpgradeQuote(input: {
  fromPriceCents: number;
  toPriceCents: number;
  discountPercent?: number;
}): UpgradeQuote | null {
  const discountPercent = input.discountPercent ?? UPGRADE_DISCOUNT_PERCENT;
  if (input.toPriceCents <= input.fromPriceCents) return null;
  const originalAmountCents = input.toPriceCents;
  const discountAmountCents = Math.round(
    (originalAmountCents * discountPercent) / 100,
  );
  const finalAmountCents = originalAmountCents - discountAmountCents;
  const entryAmountCents = Math.round(finalAmountCents / 2);
  const remainingAmountCents = finalAmountCents - entryAmountCents;
  return {
    fromPlanId: "",
    fromPriceCents: input.fromPriceCents,
    toPlanId: "",
    toPriceCents: input.toPriceCents,
    originalAmountCents,
    discountPercent,
    discountAmountCents,
    finalAmountCents,
    entryAmountCents,
    remainingAmountCents,
  };
}

/** Lista planos superiores ao atual (elegíveis para upgrade). */
export async function listUpgradeOptions(tenantId: string): Promise<
  Array<{
    plan: typeof plans.$inferSelect;
    quote: UpgradeQuote;
  }>
> {
  const loaded = await withTenant(tenantId, async (tx) => {
    const [sub] = await tx
      .select()
      .from(subscriptions)
      .where(
        and(eq(subscriptions.tenantId, tenantId), ne(subscriptions.status, "CANCELLED")),
      )
      .limit(1);
    if (!sub) return null;
    const [plan] = await tx.select().from(plans).where(eq(plans.id, sub.planId)).limit(1);
    if (!plan) return null;
    return { subscription: sub, plan };
  });

  if (!loaded) return [];

  // Se já existe upgrade pendente, não oferece novos.
  const [pending] = await withTenant(tenantId, (tx) =>
    tx
      .select({ id: subscriptionUpgrades.id })
      .from(subscriptionUpgrades)
      .where(
        and(
          eq(subscriptionUpgrades.tenantId, tenantId),
          eq(subscriptionUpgrades.status, "PENDING_PAYMENT"),
        ),
      )
      .limit(1),
  );
  if (pending) return [];

  const allPlans = await getDb()
    .select()
    .from(plans)
    .where(eq(plans.isActive, true))
    .orderBy(plans.sortOrder, plans.name);

  const result: Array<{ plan: typeof plans.$inferSelect; quote: UpgradeQuote }> = [];
  for (const candidate of allPlans) {
    if (candidate.id === loaded.plan.id) continue;
    if (candidate.priceCents <= loaded.plan.priceCents) continue;
    const quote = calculateUpgradeQuote({
      fromPriceCents: loaded.subscription.priceCents,
      toPriceCents: candidate.priceCents,
    });
    if (!quote) continue;
    result.push({
      plan: candidate,
      quote: {
        ...quote,
        fromPlanId: loaded.plan.id,
        toPlanId: candidate.id,
      },
    });
  }
  return result;
}

/** Cria a operação de upgrade e a fatura de entrada (50%). */
export async function requestUpgrade(input: {
  tenantId: string;
  actorId: string;
  toPlanId: string;
  document?: string | null;
}): Promise<{ upgrade: typeof subscriptionUpgrades.$inferSelect; invoice: InvoiceRow }> {
  const context = await withTenant(input.tenantId, async (tx) => {
    const [tenant] = await tx
      .select()
      .from(tenants)
      .where(eq(tenants.id, input.tenantId))
      .limit(1);
    if (!tenant) throw new BillingError("NOT_FOUND", "Estabelecimento não encontrado.");

    const [subscription] = await tx
      .select()
      .from(subscriptions)
      .where(
        and(eq(subscriptions.tenantId, input.tenantId), ne(subscriptions.status, "CANCELLED")),
      )
      .limit(1);
    if (!subscription) throw new BillingError("NO_SUBSCRIPTION", "Nenhuma assinatura encontrada.");
    if (subscription.status !== "ACTIVE") {
      throw new BillingError("CANCELLED", "Apenas assinaturas ativas podem fazer upgrade.");
    }

    const [fromPlan] = await tx
      .select()
      .from(plans)
      .where(eq(plans.id, subscription.planId))
      .limit(1);
    if (!fromPlan) throw new BillingError("NOT_FOUND", "Plano atual não encontrado.");

    const [toPlan] = await tx
      .select()
      .from(plans)
      .where(and(eq(plans.id, input.toPlanId), eq(plans.isActive, true)))
      .limit(1);
    if (!toPlan) throw new BillingError("NOT_FOUND", "Plano de destino não encontrado.");
    if (toPlan.priceCents <= subscription.priceCents) {
      throw new BillingError("PAYMENT_CONFLICT", "O plano escolhido não é superior ao atual.");
    }

    // Impede upgrades pendentes duplicados.
    const [pending] = await tx
      .select({ id: subscriptionUpgrades.id })
      .from(subscriptionUpgrades)
      .where(
        and(
          eq(subscriptionUpgrades.tenantId, input.tenantId),
          eq(subscriptionUpgrades.status, "PENDING_PAYMENT"),
        ),
      )
      .limit(1);
    if (pending) {
      throw new BillingError("PAYMENT_CONFLICT", "Já existe um upgrade aguardando pagamento.");
    }

    // Impede segunda fatura aberta.
    const [openInvoice] = await tx
      .select({ id: invoices.id })
      .from(invoices)
      .where(
        and(
          eq(invoices.subscriptionId, subscription.id),
          inArray(invoices.status, ["DRAFT", "OPEN", "OVERDUE"]),
        ),
      )
      .limit(1);
    if (openInvoice) {
      throw new BillingError("PAYMENT_CONFLICT", "Já existe uma fatura em aberto. Quite-a antes de fazer upgrade.");
    }

    const quote = calculateUpgradeQuote({
      fromPriceCents: subscription.priceCents,
      toPriceCents: toPlan.priceCents,
    });
    if (!quote) {
      throw new BillingError("PAYMENT_CONFLICT", "Upgrade inválido.");
    }

    const upgradeId = uuidv7();
    const nextDueDate = subscription.nextDueDate ?? null;

    const [createdUpgrade] = await tx
      .insert(subscriptionUpgrades)
      .values({
        id: upgradeId,
        tenantId: input.tenantId,
        subscriptionId: subscription.id,
        fromPlanId: fromPlan.id,
        toPlanId: toPlan.id,
        fromPriceCents: subscription.priceCents,
        toPriceCents: toPlan.priceCents,
        originalAmountCents: quote.originalAmountCents,
        discountPercent: quote.discountPercent,
        discountAmountCents: quote.discountAmountCents,
        finalAmountCents: quote.finalAmountCents,
        entryAmountCents: quote.entryAmountCents,
        remainingAmountCents: quote.remainingAmountCents,
        status: "PENDING_PAYMENT",
        nextDueDate,
      })
      .returning();

    if (!createdUpgrade) throw new Error("Falha ao criar upgrade.");

    // Fatura de entrada (50%).
    const dueDate = nextDueDate ?? new Date().toISOString().slice(0, 10);
    const [invoice] = await tx
      .insert(invoices)
      .values({
        tenantId: input.tenantId,
        subscriptionId: subscription.id,
        kind: "UPGRADE",
        status: "DRAFT",
        planAmountCents: quote.entryAmountCents,
        activationAmountCents: 0,
        discountCents: 0,
        totalCents: quote.entryAmountCents,
        dueDate,
        description: `Upgrade ${fromPlan.name} → ${toPlan.name} — entrada`,
      })
      .returning();

    if (!invoice) throw new Error("Falha ao criar fatura de upgrade.");

    await tx
      .update(subscriptionUpgrades)
      .set({ entryInvoiceId: invoice.id, updatedAt: new Date() })
      .where(eq(subscriptionUpgrades.id, createdUpgrade.id));

    await tx.insert(auditLogs).values({
      tenantId: input.tenantId,
      actorType: "USER",
      actorId: input.actorId,
      action: "upgrade.requested",
      entityType: "subscription_upgrade",
      entityId: createdUpgrade.id,
      after: {
        fromPlanId: fromPlan.id,
        toPlanId: toPlan.id,
        originalAmountCents: quote.originalAmountCents,
        discountAmountCents: quote.discountAmountCents,
        finalAmountCents: quote.finalAmountCents,
        entryAmountCents: quote.entryAmountCents,
        remainingAmountCents: quote.remainingAmountCents,
      },
    });

    return { upgrade: { ...createdUpgrade, entryInvoiceId: invoice.id }, invoice, toPlan, fromPlan };
  });

  // Gera cobrança Pix para a entrada. Se falhar, desfaz o upgrade para não
  // deixar operação pendente bloqueando novas tentativas.
  try {
    const charged = await ensureChargeForInvoice({
      tenantId: input.tenantId,
      invoiceId: context.invoice.id,
      actorId: input.actorId,
      document: input.document,
    });
    return { upgrade: context.upgrade, invoice: charged };
  } catch (error) {
    await cancelPendingUpgrade({
      tenantId: input.tenantId,
      upgradeId: context.upgrade.id,
      actorId: input.actorId,
    }).catch(() => undefined);
    throw error;
  }
}

/** Confirma upgrade após pagamento da entrada (chamado internamente). */
export async function confirmUpgradeByInvoice(input: {
  tenantId: string;
  invoiceId: string;
  actorType: "GATEWAY" | "ADMIN" | "SYSTEM" | "USER";
  actorId?: string | null;
}): Promise<boolean> {
  return withTenant(input.tenantId, async (tx) => {
    const [upgrade] = await tx
      .select()
      .from(subscriptionUpgrades)
      .where(eq(subscriptionUpgrades.entryInvoiceId, input.invoiceId))
      .limit(1);

    if (!upgrade || upgrade.status !== "PENDING_PAYMENT") return false;

    const [subscription] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, upgrade.subscriptionId))
      .for("update")
      .limit(1);
    if (!subscription) return false;

    await tx
      .update(subscriptions)
      .set({
        planId: upgrade.toPlanId,
        priceCents: upgrade.toPriceCents,
        status: "ACTIVE",
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, subscription.id));

    await tx
      .update(subscriptionUpgrades)
      .set({
        status: "CONFIRMED",
        confirmedAt: new Date(),
        remainingScheduled: false,
        updatedAt: new Date(),
      })
      .where(eq(subscriptionUpgrades.id, upgrade.id));

    await tx.insert(auditLogs).values({
      tenantId: input.tenantId,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      action: "upgrade.confirmed",
      entityType: "subscription_upgrade",
      entityId: upgrade.id,
      after: { planId: upgrade.toPlanId, priceCents: upgrade.toPriceCents },
    });

    return true;
  });
}

/** Cancela upgrade pendente (antes da confirmação). */
export async function cancelPendingUpgrade(input: {
  tenantId: string;
  upgradeId: string;
  actorId?: string | null;
}): Promise<boolean> {
  return withTenant(input.tenantId, async (tx) => {
    const [upgrade] = await tx
      .select()
      .from(subscriptionUpgrades)
      .where(
        and(
          eq(subscriptionUpgrades.id, input.upgradeId),
          eq(subscriptionUpgrades.tenantId, input.tenantId),
        ),
      )
      .limit(1);
    if (!upgrade || upgrade.status !== "PENDING_PAYMENT") return false;

    if (upgrade.entryInvoiceId) {
      await tx
        .update(invoices)
        .set({ status: "VOID", updatedAt: new Date() })
        .where(
          and(
            eq(invoices.id, upgrade.entryInvoiceId),
            eq(invoices.tenantId, input.tenantId),
            inArray(invoices.status, ["DRAFT", "OPEN", "OVERDUE"]),
          ),
        );
    }

    await tx
      .update(subscriptionUpgrades)
      .set({ status: "CANCELLED", cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(subscriptionUpgrades.id, upgrade.id));

    await tx.insert(auditLogs).values({
      tenantId: input.tenantId,
      actorType: input.actorId ? "USER" : "SYSTEM",
      actorId: input.actorId ?? null,
      action: "upgrade.cancelled",
      entityType: "subscription_upgrade",
      entityId: upgrade.id,
    });

    return true;
  });
}

/** Lista upgrades de um tenant. */
export async function listUpgrades(tenantId: string) {
  return withTenant(tenantId, (tx) =>
    tx
      .select()
      .from(subscriptionUpgrades)
      .where(eq(subscriptionUpgrades.tenantId, tenantId))
      .orderBy(desc(subscriptionUpgrades.createdAt)),
  );
}

/** Lista todos os upgrades (admin). */
export async function listAllUpgrades() {
  return getDb()
    .select({
      upgrade: subscriptionUpgrades,
      tenant: tenants,
    })
    .from(subscriptionUpgrades)
    .innerJoin(tenants, eq(tenants.id, subscriptionUpgrades.tenantId))
    .orderBy(desc(subscriptionUpgrades.createdAt));
}

/** Soma valores restantes a cobrar para um tenant (confirmados não faturados). */
export async function pendingRemainingCents(tenantId: string): Promise<number> {
  const rows = await withTenant(tenantId, (tx) =>
    tx
      .select({ total: sql<string>`coalesce(sum(${subscriptionUpgrades.remainingAmountCents}), 0)` })
      .from(subscriptionUpgrades)
      .where(
        and(
          eq(subscriptionUpgrades.tenantId, tenantId),
          eq(subscriptionUpgrades.status, "CONFIRMED"),
          eq(subscriptionUpgrades.remainingScheduled, false),
        ),
      ),
  );
  return Number(rows[0]?.total ?? 0);
}

/** Marca remaining como faturado. */
export async function markRemainingScheduled(input: {
  tenantId: string;
  invoiceId: string;
  upgradeIds: string[];
}): Promise<void> {
  if (input.upgradeIds.length === 0) return;
  await withTenant(input.tenantId, async (tx) => {
    await tx
      .update(subscriptionUpgrades)
      .set({ remainingScheduled: true, remainingInvoiceId: input.invoiceId, updatedAt: new Date() })
      .where(
        and(
          eq(subscriptionUpgrades.tenantId, input.tenantId),
          inArray(subscriptionUpgrades.id, input.upgradeIds),
        ),
      );  });
}
