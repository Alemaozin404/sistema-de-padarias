import { and, eq, ne, desc } from "drizzle-orm";
import { withTenant } from "@/lib/db";
import {
  invoices,
  payments,
  refundRequests,
  subscriptions,
  subscriptionStatusHistory,
  auditLogs,
  tenants,
} from "@/db/schema";
import { BillingError } from "./service";
import { markInvoiceRefunded } from "./service";
import { isWithinRefundWindow, canTransitionRefund, type RefundStatus } from "./refund-rules";

export type RefundErrorCode = "NOT_FOUND" | "NO_SUBSCRIPTION" | "OUTSIDE_WINDOW" | "ALREADY_REQUESTED" | "INVALID_TRANSITION" | "NOT_PAID";

export class RefundError extends Error {
  constructor(public readonly code: RefundErrorCode, message: string) {
    super(message);
    this.name = "RefundError";
  }
}

/** Solicita reembolso dentro do prazo de 7 dias após a confirmação do pagamento. */
export async function requestRefund(input: {
  tenantId: string;
  invoiceId: string;
  reason?: string | null;
  actorId: string;
}): Promise<{ requestId: string }> {
  return withTenant(input.tenantId, async (tx) => {
    const [invoice] = await tx
      .select()
      .from(invoices)
      .where(and(eq(invoices.tenantId, input.tenantId), eq(invoices.id, input.invoiceId)))
      .limit(1);

    if (!invoice) throw new RefundError("NOT_FOUND", "Fatura não encontrada.");
    if (invoice.status !== "PAID") throw new RefundError("NOT_PAID", "Apenas faturas pagas podem ser reembolsadas.");

    const [payment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.invoiceId, invoice.id))
      .orderBy(desc(payments.createdAt))
      .limit(1);

    const paidAt = payment?.paidAt ?? invoice.paidAt;
    if (!paidAt) throw new RefundError("NOT_PAID", "Pagamento não confirmado.");
    if (!isWithinRefundWindow(paidAt, new Date())) {
      throw new RefundError("OUTSIDE_WINDOW", "O prazo de 7 dias para reembolso expirou.");
    }

    const [existing] = await tx
      .select({ id: refundRequests.id })
      .from(refundRequests)
      .where(and(eq(refundRequests.tenantId, input.tenantId), eq(refundRequests.invoiceId, input.invoiceId)))
      .limit(1);

    if (existing) throw new RefundError("ALREADY_REQUESTED", "Já existe uma solicitação de reembolso para esta fatura.");

    const [subscription] = await tx
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.tenantId, input.tenantId), eq(subscriptions.id, invoice.subscriptionId)))
      .limit(1);

    if (!subscription) throw new RefundError("NO_SUBSCRIPTION", "Assinatura não encontrada.");

    const [created] = await tx
      .insert(refundRequests)
      .values({
        tenantId: input.tenantId,
        subscriptionId: subscription.id,
        invoiceId: invoice.id,
        paymentId: payment?.gatewayPaymentId ?? null,
        amountCents: invoice.totalCents,
        reason: input.reason ?? null,
        status: "REQUESTED",
        requestedBy: input.actorId,
        requestedAt: new Date(),
      })
      .returning({ id: refundRequests.id });

    if (!created) throw new RefundError("NOT_FOUND", "Falha ao registrar reembolso.");

    await tx.insert(auditLogs).values({
      tenantId: input.tenantId,
      actorType: "USER",
      actorId: input.actorId,
      action: "refund.requested",
      entityType: "refund_request",
      entityId: created.id,
      after: { invoiceId: invoice.id, amountCents: invoice.totalCents },
    });

    return { requestId: created.id };
  });
}

export async function transitionRefund(input: {
  tenantId: string;
  requestId: string;
  to: RefundStatus;
  actorId: string | null;
  actorType: "USER" | "ADMIN" | "SYSTEM" | "GATEWAY";
  gatewayRefundId?: string | null;
  failureReason?: string | null;
}): Promise<void> {
  await withTenant(input.tenantId, async (tx) => {
    const [request] = await tx
      .select()
      .from(refundRequests)
      .where(and(eq(refundRequests.tenantId, input.tenantId), eq(refundRequests.id, input.requestId)))
      .for("update")
      .limit(1);

    if (!request) throw new RefundError("NOT_FOUND", "Solicitação não encontrada.");

    const current = request.status as RefundStatus;
    if (!canTransitionRefund(current, input.to)) {
      throw new RefundError("INVALID_TRANSITION", `Transição ${current} → ${input.to} não permitida.`);
    }

    const now = new Date();
    const updates: Partial<typeof refundRequests.$inferInsert> = {
      status: input.to,
      updatedAt: now,
    };
    if (input.to === "IN_ANALYSIS") updates.analyzedAt = now;
    if (input.to === "PROCESSED" || input.to === "FAILED") updates.processedAt = now;
    if (input.gatewayRefundId) updates.gatewayRefundId = input.gatewayRefundId;
    if (input.failureReason) updates.failureReason = input.failureReason;

    await tx.update(refundRequests).set(updates).where(eq(refundRequests.id, request.id));

    await tx.insert(auditLogs).values({
      tenantId: input.tenantId,
      actorType: input.actorType,
      actorId: input.actorId,
      action: `refund.${input.to.toLowerCase()}`,
      entityType: "refund_request",
      entityId: request.id,
      before: { status: current },
      after: { status: input.to },
    });

    // Quando o gateway confirma o reembolso: encerra assinatura + bloqueia acesso.
    if (input.to === "PROCESSED") {
      const [subscription] = await tx
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, request.subscriptionId))
        .limit(1);

      if (subscription && subscription.status !== "CANCELLED") {
        await tx
          .update(subscriptions)
          .set({ status: "CANCELLED", cancelledAt: now, updatedAt: now })
          .where(eq(subscriptions.id, subscription.id));

        await tx.insert(subscriptionStatusHistory).values({
          tenantId: input.tenantId,
          subscriptionId: subscription.id,
          fromStatus: subscription.status,
          toStatus: "CANCELLED",
          reason: `refund_processed:${request.id}`,
          actorType: "GATEWAY",
          actorId: input.actorId,
        });
      }

      // Marca fatura como estornada.
      await markInvoiceRefunded({
        tenantId: input.tenantId,
        invoiceId: request.invoiceId,
        gateway: "MERCADOPAGO",
        gatewayPaymentId: request.paymentId ?? "",
      });

      // Bloqueia o tenant (acesso suspenso).
      await tx
        .update(tenants)
        .set({ status: "SUSPENDED", updatedAt: now })
        .where(eq(tenants.id, input.tenantId));
    }
  });
}

export async function listRefundRequests(tenantId?: string) {
  if (tenantId) {
    return withTenant(tenantId, (tx) =>
      tx.select().from(refundRequests).where(eq(refundRequests.tenantId, tenantId)).orderBy(desc(refundRequests.requestedAt)),
    );
  }
  // global (admin) - sem tenant context
  const { getDb } = await import("@/lib/db");
  return getDb().select().from(refundRequests).orderBy(desc(refundRequests.requestedAt));
}

export async function getRefundRequest(tenantId: string, requestId: string) {
  const rows = await withTenant(tenantId, (tx) =>
    tx.select().from(refundRequests).where(and(eq(refundRequests.tenantId, tenantId), eq(refundRequests.id, requestId))).limit(1),
  );
  return rows[0] ?? null;
}