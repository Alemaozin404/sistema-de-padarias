import { and, eq, ne } from "drizzle-orm";
import { withTenant } from "@/lib/db";
import { auditLogs, cancellationRequests, invoices, subscriptions, subscriptionStatusHistory } from "@/db/schema";
import { BillingError } from "./service";

export type CancellationErrorCode = "NOT_FOUND" | "NO_SUBSCRIPTION" | "ALREADY_CANCELLED";

export class CancellationError extends Error {
  constructor(public readonly code: CancellationErrorCode, message: string) {
    super(message);
    this.name = "CancellationError";
  }
}

export async function requestCancellation(input: {
  tenantId: string;
  actorId: string;
  reason?: string | null;
}): Promise<{ requestId: string }> {
  return withTenant(input.tenantId, async (tx) => {
    const [subscription] = await tx
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.tenantId, input.tenantId), ne(subscriptions.status, "CANCELLED")))
      .limit(1);

    if (!subscription) {
      throw new CancellationError("NO_SUBSCRIPTION", "Nenhuma assinatura ativa encontrada.");
    }

    const [existing] = await tx
      .select({ id: cancellationRequests.id })
      .from(cancellationRequests)
      .where(and(eq(cancellationRequests.tenantId, input.tenantId), eq(cancellationRequests.status, "REQUESTED")))
      .limit(1);

    if (existing) {
      return { requestId: existing.id };
    }

    const [created] = await tx
      .insert(cancellationRequests)
      .values({
        tenantId: input.tenantId,
        subscriptionId: subscription.id,
        reason: input.reason ?? null,
        status: "REQUESTED",
        requestedBy: input.actorId,
        requestedAt: new Date(),
      })
      .returning({ id: cancellationRequests.id });

    if (!created) throw new CancellationError("NOT_FOUND", "Falha ao registrar cancelamento.");

    await tx.insert(auditLogs).values({
      tenantId: input.tenantId,
      actorType: "USER",
      actorId: input.actorId,
      action: "subscription.cancellation_requested",
      entityType: "subscription",
      entityId: subscription.id,
      after: { reason: input.reason ?? null, requestId: created.id },
    });

    return { requestId: created.id };
  });
}

/** Confirma o cancelamento: encerra a assinatura e impede cobranças futuras. */
export async function confirmCancellation(input: {
  tenantId: string;
  requestId?: string | null;
  actorId: string | null;
  actorType: "USER" | "ADMIN" | "SYSTEM" | "GATEWAY";
  reason?: string | null;
}): Promise<void> {
  await withTenant(input.tenantId, async (tx) => {
    const [subscription] = await tx
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.tenantId, input.tenantId), ne(subscriptions.status, "CANCELLED")))
      .limit(1);

    if (!subscription) return;

    const now = new Date();

    await tx
      .update(subscriptions)
      .set({
        status: "CANCELLED",
        cancelAtPeriodEnd: true,
        cancelledAt: now,
        updatedAt: now,
      })
      .where(eq(subscriptions.id, subscription.id));

    await tx.insert(subscriptionStatusHistory).values({
      tenantId: input.tenantId,
      subscriptionId: subscription.id,
      fromStatus: subscription.status,
      toStatus: "CANCELLED",
      reason: input.reason ?? "cancellation_confirmed",
      actorType: input.actorType,
      actorId: input.actorId,
    });

    // Cancela cobranças abertas para impedir cobrança futura.
    const openInvoices = await tx
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.subscriptionId, subscription.id), eq(invoices.status, "OPEN")));

    for (const inv of openInvoices) {
      await tx
        .update(invoices)
        .set({ status: "VOID", updatedAt: now })
        .where(eq(invoices.id, inv.id));
    }

    if (input.requestId) {
      await tx
        .update(cancellationRequests)
        .set({ status: "CONFIRMED", effectiveAt: now, updatedAt: now })
        .where(eq(cancellationRequests.id, input.requestId));
    }

    await tx.insert(auditLogs).values({
      tenantId: input.tenantId,
      actorType: input.actorType,
      actorId: input.actorId,
      action: "subscription.cancelled",
      entityType: "subscription",
      entityId: subscription.id,
      before: { status: subscription.status },
      after: { status: "CANCELLED", reason: input.reason ?? null },
    });
  });
}

export async function listCancellationRequests(tenantId: string) {
  return withTenant(tenantId, (tx) =>
    tx
      .select()
      .from(cancellationRequests)
      .where(eq(cancellationRequests.tenantId, tenantId))
      .orderBy(cancellationRequests.requestedAt),
  );
}