import { and, desc, eq, gte, inArray, isNull, lte, lt, ne, or, sql } from "drizzle-orm";
import { getDb, withTenant, type Database } from "@/lib/db";
import { uuidv7 } from "@/lib/id";
import {
  auditLogs,
  invoices,
  payments,
  plans,
  subscriptions,
  subscriptionStatusHistory,
  subscriptionGrants,
  subscriptionUpgrades,
  tenantDiscounts,
  tenants,
} from "@/db/schema";
import {
  createCustomer,
  createPixPayment,
  createCardPayment,
  findCustomerByDocument,
  findPaymentByExternalReference,
  getPayment,
  cancelPayment,
  getPixQrCode,
  type MercadoPagoPayment,
} from "./gateway";
import { getActiveGrant, grantDiscountCents } from "@/modules/promotions/grants";
import {
  centsFromGateway,
  externalReferenceFor,
  invoiceTotalCents,
  isValidDocument,
  isoDate,
  mapPaymentMethod,
  normalizeDocument,
  paidPeriod,
  resolveDiscountCents,
  todayIso,
  type PaymentMethod,
} from "./rules";

/**
 * Cobrança: fatura é a fonte de verdade do valor; o gateway só executa.
 * A assinatura só muda de estado depois de pagamento confirmado por webhook,
 * conciliação ou registro manual do admin.
 */

export type BillingErrorCode =
  | "NOT_FOUND"
  | "NO_SUBSCRIPTION"
  | "DOCUMENT_REQUIRED"
  | "INVALID_DOCUMENT"
  | "AMOUNT_MISMATCH"
  | "PAYMENT_CONFLICT"
  | "GATEWAY_REQUIRED"
  | "CANCELLED";

export class BillingError extends Error {
  constructor(
    public readonly code: BillingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "BillingError";
  }
}

export type InvoiceRow = typeof invoices.$inferSelect;

export async function listInvoices(tenantId: string, limit = 36): Promise<InvoiceRow[]> {
  return withTenant(tenantId, (tx) =>
    tx
      .select()
      .from(invoices)
      .where(eq(invoices.tenantId, tenantId))
      .orderBy(desc(invoices.createdAt))
      .limit(limit),
  );
}

export async function getInvoice(tenantId: string, invoiceId: string): Promise<InvoiceRow | null> {
  const [row] = await withTenant(tenantId, (tx) =>
    tx
      .select()
      .from(invoices)
      .where(and(eq(invoices.tenantId, tenantId), eq(invoices.id, invoiceId)))
      .limit(1),
  );
  return row ?? null;
}

type BillingContext = {
  tenant: typeof tenants.$inferSelect;
  subscription: typeof subscriptions.$inferSelect;
  plan: typeof plans.$inferSelect;
  openInvoice: InvoiceRow | null;
};

async function loadBillingContext(tenantId: string): Promise<BillingContext> {
  return withTenant(tenantId, async (tx) => {
    const [tenant] = await tx
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    if (!tenant) throw new BillingError("NOT_FOUND", "Estabelecimento não encontrado.");

    const [subscription] = await tx
      .select()
      .from(subscriptions)
      .where(
        and(eq(subscriptions.tenantId, tenantId), ne(subscriptions.status, "CANCELLED")),
      )
      .limit(1);
    if (!subscription) {
      throw new BillingError("NO_SUBSCRIPTION", "Nenhuma assinatura encontrada.");
    }

    const [plan] = await tx
      .select()
      .from(plans)
      .where(eq(plans.id, subscription.planId))
      .limit(1);
    if (!plan) throw new BillingError("NOT_FOUND", "Plano da assinatura não encontrado.");

    const [openInvoice] = await tx
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.subscriptionId, subscription.id),
          inArray(invoices.status, ["DRAFT", "OPEN", "OVERDUE"]),
        ),
      )
      .orderBy(desc(invoices.createdAt))
      .limit(1);

    return { tenant, subscription, plan, openInvoice: openInvoice ?? null };
  });
}

/**
 * Cria (ou retoma) a fatura do primeiro pagamento. Valores vêm do snapshot da
 * assinatura, nunca do formulário.
 */
/** Desconto negociado vigente na data; o mais recente vence. */
async function activeDiscount(
  tx: Database,
  tenantId: string,
  date: string,
): Promise<{ discountType: string; value: number } | null> {
  const [row] = await tx
    .select({ discountType: tenantDiscounts.discountType, value: tenantDiscounts.value })
    .from(tenantDiscounts)
    .where(
      and(
        eq(tenantDiscounts.tenantId, tenantId),
        lte(tenantDiscounts.validFrom, date),
        or(isNull(tenantDiscounts.validTo), gte(tenantDiscounts.validTo, date)),
      ),
    )
    .orderBy(desc(tenantDiscounts.validFrom), desc(tenantDiscounts.createdAt))
    .limit(1);

  return row ?? null;
}

export async function createInitialInvoice(input: {
  tenantId: string;
  actorId: string;
  document?: string | null;
  planId?: string | null;
}): Promise<{ invoice: InvoiceRow; resumed: boolean }> {
  let context = await loadBillingContext(input.tenantId);

  if (context.openInvoice) {
    return { invoice: context.openInvoice, resumed: true };
  }

  if (context.subscription.status === "CANCELLED") {
    throw new BillingError("CANCELLED", "Assinatura encerrada não gera nova cobrança.");
  }

  // Permite escolher/trocar o plano enquanto a assinatura ainda não foi paga.
  if (input.planId && context.subscription.status === "PENDING") {
    const [chosen] = await getDb()
      .select()
      .from(plans)
      .where(and(eq(plans.id, input.planId), eq(plans.isActive, true)))
      .limit(1);
    if (chosen) {
      await withTenant(input.tenantId, (tx) =>
        tx
          .update(subscriptions)
          .set({
            planId: chosen.id,
            priceCents: chosen.priceCents,
            activationFeeCents: chosen.activationFeeCents,
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.id, context.subscription.id)),
      );
      context = await loadBillingContext(input.tenantId);
    }
  }

  if (input.document) {
    const digits = normalizeDocument(input.document);
    if (!isValidDocument(digits)) {
      throw new BillingError("INVALID_DOCUMENT", "Informe um CPF ou CNPJ válido.");
    }

    await withTenant(input.tenantId, (tx) =>
      tx
        .update(tenants)
        .set({ document: digits, updatedAt: new Date() })
        .where(eq(tenants.id, input.tenantId)),
    );
    context = await loadBillingContext(input.tenantId);
  }

  const [paid] = await withTenant(input.tenantId, (tx) =>
    tx
      .select({ id: invoices.id })
      .from(invoices)
      .where(
        and(
          eq(invoices.subscriptionId, context.subscription.id),
          eq(invoices.status, "PAID"),
        ),
      )
      .limit(1),
  );

  const kind = paid ? "RENEWAL" : "INITIAL";
  const activationAmountCents = paid ? 0 : context.subscription.activationFeeCents;
  const dueDate = context.subscription.nextDueDate ?? todayIso();
  const negotiated = await withTenant(input.tenantId, (tx) =>
    activeDiscount(tx, input.tenantId, todayIso()),
  );
  const negotiatedDiscount = resolveDiscountCents(context.subscription.priceCents, negotiated);

  const grant = await getActiveGrant(input.tenantId, context.subscription.id);
  const grantDiscount = grant ? grantDiscountCents(grant, context.subscription.priceCents) : 0;
  const waiveActivation =
    !!grant && grant.waiveActivationFee && activationAmountCents > 0 && !paid;
  const activationDiscount = waiveActivation ? activationAmountCents : 0;

  const discountCents = Math.min(
    context.subscription.priceCents + activationAmountCents,
    negotiatedDiscount + grantDiscount + activationDiscount,
  );
  const totalCents = invoiceTotalCents({
    planAmountCents: context.subscription.priceCents,
    activationAmountCents,
    discountCents,
  });
  const appliedGrantId = grant?.id ?? null;
  const description = `${context.plan.name} — ${
    kind === "INITIAL" ? "primeira mensalidade + ativação" : "renovação mensal"
  }`;

  try {
    const [created] = await withTenant(input.tenantId, async (tx) => {
      const rows = await tx
        .insert(invoices)
        .values({
          tenantId: input.tenantId,
          subscriptionId: context.subscription.id,
          kind,
          status: "DRAFT",
          planAmountCents: context.subscription.priceCents,
          activationAmountCents,
          discountCents,
          totalCents,
          dueDate,
          description,
          appliedGrantId,
        })
        .returning();

      if (!rows[0]) throw new Error("Falha ao criar fatura.");

      await tx.insert(auditLogs).values({
        tenantId: input.tenantId,
        actorType: "USER",
        actorId: input.actorId,
        action: "invoice.created",
        entityType: "invoice",
        entityId: rows[0].id,
        after: { kind, totalCents, discountCents, dueDate },
      });

      return rows;
    });

    if (!created) throw new Error("Falha ao criar fatura.");
    return { invoice: created, resumed: false };
  } catch (error) {
    // Corrida entre dois cliques: a constraint de fatura aberta decide; a
    // segunda requisição reaproveita a que venceu.
    if (error instanceof Error && /invoices_one_open_per_subscription|duplicate/i.test(error.message)) {
      const retry = await loadBillingContext(input.tenantId);
      if (retry.openInvoice) return { invoice: retry.openInvoice, resumed: true };
    }
    throw error;
  }
}

/**
 * Garante cliente e cobrança Pix no gateway para uma fatura já existente.
 * Reexecutar é seguro: reaproveita cliente e cobrança (inclusive após erro de
 * rede entre a criação e a gravação do id).
 */
export async function ensureChargeForInvoice(input: {
  tenantId: string;
  invoiceId: string;
  actorId: string;
  document?: string | null;
}): Promise<InvoiceRow> {
  const invoice = await getInvoice(input.tenantId, input.invoiceId);
  if (!invoice) throw new BillingError("NOT_FOUND", "Fatura não encontrada.");
  if (invoice.status === "PAID" || invoice.status === "VOID" || invoice.status === "REFUNDED") {
    return invoice;
  }

  if (invoice.totalCents === 0) {
    await applyConfirmedPayment({
      tenantId: input.tenantId,
      invoiceId: invoice.id,
      gateway: "PROMOTION",
      gatewayPaymentId: `promotion:${invoice.id}`,
      method: "PROMOTIONAL",
      amountCents: 0,
      paidAt: new Date(),
      raw: { source: "promotion", invoiceId: invoice.id },
      actorType: "USER",
      actorId: input.actorId,
      gatewayInvoiceId: null,
    });
    const updated = await getInvoice(input.tenantId, invoice.id);
    if (!updated) throw new BillingError("NOT_FOUND", "Fatura não encontrada.");
    return updated;
  }

  const context = await loadBillingContext(input.tenantId);

  if (input.document) {
    const digits = normalizeDocument(input.document);
    if (!isValidDocument(digits)) {
      throw new BillingError("INVALID_DOCUMENT", "Informe um CPF ou CNPJ válido.");
    }
    await withTenant(input.tenantId, (tx) =>
      tx
        .update(tenants)
        .set({ document: digits, updatedAt: new Date() })
        .where(eq(tenants.id, input.tenantId)),
    );
    context.tenant.document = digits;
  }

  const document = context.tenant.document;
  if (!document) {
    throw new BillingError(
      "DOCUMENT_REQUIRED",
      "Informe o CNPJ (ou CPF) do estabelecimento para emitir a cobrança.",
    );
  }
  if (!isValidDocument(document)) {
    throw new BillingError(
      "INVALID_DOCUMENT",
      "O CNPJ cadastrado é inválido. Corrija o documento para emitir a cobrança.",
    );
  }

  let customerId = context.subscription.gatewayCustomerId;
  if (!customerId) {
    const existing = await findCustomerByDocument(document);
    const customer =
      existing ??
      (await createCustomer({
        name: context.tenant.tradeName,
        document,
        email: context.tenant.email,
        mobilePhone: context.tenant.whatsapp,
        externalReference: input.tenantId,
      }));
    customerId = customer.id;

    await withTenant(input.tenantId, (tx) =>
      tx
        .update(subscriptions)
        .set({ gatewayCustomerId: customerId, updatedAt: new Date() })
        .where(eq(subscriptions.id, context.subscription.id)),
    );
  }

  const externalReference = externalReferenceFor(input.tenantId, invoice.id);

  let charge: MercadoPagoPayment | null = null;
  if (invoice.gatewayInvoiceId) {
    charge = await getPayment(invoice.gatewayInvoiceId);
  } else {
    charge =
      (await findPaymentByExternalReference(externalReference)) ??
      (await createPixPayment({
        customerId,
        valueCents: invoice.totalCents,
        description: invoice.description ?? `Fatura ${invoice.kind}`,
        externalReference,
        payerEmail: context.tenant.email ?? "cliente@padaria.com",
        payerDocument: document,
      }));
  }

  const qrCode = await getPixQrCode(charge.id);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  const [updated] = await withTenant(input.tenantId, async (tx) => {
    const rows = await tx
      .update(invoices)
      .set({
        status: invoice.status === "OVERDUE" ? "OVERDUE" : "OPEN",
        gateway: "MERCADOPAGO",
        gatewayInvoiceId: charge.id,
        invoiceUrl: charge.ticket_url ?? charge.point_of_interaction?.transaction_data?.ticket_url ?? undefined,
        pixPayload: qrCode.payload,
        pixExpiresAt: expiresAt,
        updatedAt: new Date(),
      })
      .where(and(eq(invoices.id, invoice.id), eq(invoices.tenantId, input.tenantId)))
      .returning();

    await tx.insert(auditLogs).values({
      tenantId: input.tenantId,
      actorType: "USER",
      actorId: input.actorId,
      action: "invoice.charge_created",
      entityType: "invoice",
      entityId: invoice.id,
      after: { gateway: "MERCADOPAGO", gatewayInvoiceId: charge.id, totalCents: invoice.totalCents },
    });

    return rows;
  });

  if (!updated) throw new Error("Falha ao atualizar a fatura com a cobrança.");
  return updated;
}

/** Pagamento com cartão via token gerado no frontend (Payment Brick). */
export async function processCardPayment(input: {
  tenantId: string;
  invoiceId: string;
  actorId: string;
  token: string;
  installments: number;
  paymentMethodId: string;
  issuerId?: string | null;
  payerEmail: string;
  payerDocument?: string | null;
}): Promise<{ status: string; paymentId: string }> {
  const invoice = await getInvoice(input.tenantId, input.invoiceId);
  if (!invoice) throw new BillingError("NOT_FOUND", "Fatura não encontrada.");
  if (invoice.status === "PAID") return { status: "approved", paymentId: invoice.gatewayInvoiceId ?? "" };

  const context = await loadBillingContext(input.tenantId);
  const document = input.payerDocument ?? context.tenant.document;
  if (!document || !isValidDocument(document)) {
    throw new BillingError("DOCUMENT_REQUIRED", "Informe um CPF ou CNPJ válido.");
  }

  const externalReference = externalReferenceFor(input.tenantId, invoice.id);
  const payment = await createCardPayment({
    token: input.token,
    valueCents: invoice.totalCents,
    installments: input.installments,
    paymentMethodId: input.paymentMethodId,
    issuerId: input.issuerId,
    description: invoice.description ?? `Fatura ${invoice.kind}`,
    externalReference,
    payerEmail: input.payerEmail,
    payerDocument: document,
  });

  if (payment.status === "approved") {
    const amount = centsFromGateway(payment.transaction_amount);
    if (amount !== null) {
      await applyConfirmedPayment({
        tenantId: input.tenantId,
        invoiceId: invoice.id,
        gateway: "MERCADOPAGO",
        gatewayPaymentId: payment.id,
        method: "CARD",
        amountCents: amount,
        paidAt: payment.date_approved ?? payment.date_created,
        raw: payment,
        actorType: "USER",
        actorId: input.actorId,
        gatewayInvoiceId: payment.id,
      });
    }
  }

  await withTenant(input.tenantId, (tx) =>
    tx
      .update(invoices)
      .set({
        gateway: "MERCADOPAGO",
        gatewayInvoiceId: invoice.gatewayInvoiceId ?? payment.id,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoice.id)),
  );

  return { status: payment.status ?? "unknown", paymentId: payment.id };
}

/** Checkout completo: fatura + cliente + Pix. */
export async function startCheckout(input: {
  tenantId: string;
  actorId: string;
  document?: string | null;
  planId?: string | null;
}): Promise<InvoiceRow> {
  const { invoice } = await createInitialInvoice(input);
  return ensureChargeForInvoice({
    tenantId: input.tenantId,
    invoiceId: invoice.id,
    actorId: input.actorId,
    document: input.document,
  });
}

/* -------------------------------------------------------------------------- */
/* Confirmação de pagamento                                                   */
/* -------------------------------------------------------------------------- */

type PaidAtInput = Date | string | null | undefined;

function parsePaidAt(value: PaidAtInput): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" && value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

export type ConfirmedPayment = {
  tenantId: string;
  invoiceId: string;
  gateway: string;
  gatewayPaymentId: string;
  method: PaymentMethod;
  amountCents: number;
  paidAt?: PaidAtInput;
  raw?: unknown;
  actorType: "GATEWAY" | "ADMIN" | "SYSTEM" | "USER";
  actorId?: string | null;
  gatewayInvoiceId?: string | null;
  invoiceUrl?: string | null;
};

/**
 * Efeito único de um pagamento confirmado. Chamado pelo webhook, pela
 * conciliação e pelo registro manual. É idempotente por
 * `UNIQUE (gateway, gateway_payment_id)`.
 */
export async function applyConfirmedPayment(
  input: ConfirmedPayment,
): Promise<{ applied: boolean }> {
  return withTenant(input.tenantId, async (tx) => {
    const [invoice] = await tx
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, input.invoiceId), eq(invoices.tenantId, input.tenantId)))
      .for("update")
      .limit(1);

    if (!invoice) throw new BillingError("NOT_FOUND", "Fatura não encontrada.");
    if (invoice.status === "PAID") return { applied: false };

    if (invoice.status === "VOID" || invoice.status === "REFUNDED") {
      throw new BillingError("PAYMENT_CONFLICT", "Fatura não está apta a receber pagamento.");
    }

    if (input.amountCents !== invoice.totalCents) {
      throw new BillingError(
        "AMOUNT_MISMATCH",
        `Valor pago (${input.amountCents}) não confere com a fatura (${invoice.totalCents}).`,
      );
    }

    const [payment] = await tx
      .insert(payments)
      .values({
        tenantId: input.tenantId,
        invoiceId: invoice.id,
        gateway: input.gateway,
        gatewayPaymentId: input.gatewayPaymentId,
        method: input.method,
        amountCents: input.amountCents,
        status: "CONFIRMED",
        paidAt: parsePaidAt(input.paidAt),
        raw: (input.raw ?? null) as never,
      })
      .onConflictDoNothing()
      .returning({ id: payments.id });

    if (!payment) {
      const [existing] = await tx
        .select({ invoiceId: payments.invoiceId })
        .from(payments)
        .where(
          and(
            eq(payments.gateway, input.gateway),
            eq(payments.gatewayPaymentId, input.gatewayPaymentId),
          ),
        )
        .limit(1);

      if (!existing || existing.invoiceId !== invoice.id) {
        throw new BillingError(
          "PAYMENT_CONFLICT",
          "Este pagamento já está vinculado a outra fatura.",
        );
      }
    }

    const paidAt = parsePaidAt(input.paidAt);

    await tx
      .update(invoices)
      .set({
        status: "PAID",
        paidAt,
        gateway: invoice.gateway ?? input.gateway,
        gatewayInvoiceId: invoice.gatewayInvoiceId ?? input.gatewayInvoiceId ?? undefined,
        invoiceUrl: invoice.invoiceUrl ?? input.invoiceUrl ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoice.id));

    const [subscription] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, invoice.subscriptionId))
      .for("update")
      .limit(1);

    if (!subscription) throw new BillingError("NO_SUBSCRIPTION", "Assinatura não encontrada.");

    const isUpgradeInvoice = invoice.kind === "UPGRADE";

    // Carrega upgrade vinculado à fatura de entrada (se houver).
    const [linkedUpgrade] = isUpgradeInvoice
      ? await tx
          .select()
          .from(subscriptionUpgrades)
          .where(eq(subscriptionUpgrades.entryInvoiceId, invoice.id))
          .limit(1)
      : [];

    if (subscription.status !== "CANCELLED") {
      const period = paidPeriod(paidAt);
      const isRenewal = invoice.kind === "RENEWAL";
      const previousEnd = subscription.currentPeriodEnd;

      let periodStart = paidAt;
      let periodEnd = period.periodEnd;
      let nextDueDate = period.nextDueDate;

      // Renovação paga antes do fim do período atual estende o período em vez
      // de encurtá-lo. Pagamento em atraso recomeça a contar do pagamento.
      if (
        isRenewal &&
        previousEnd &&
        previousEnd.getTime() > paidAt.getTime()
      ) {
        periodStart = previousEnd;
        periodEnd = paidPeriod(previousEnd).periodEnd;
        nextDueDate = isoDate(periodEnd);
      }

      const fromStatus = subscription.status;

      if (isUpgradeInvoice && linkedUpgrade) {
        // Upgrade confirmado: troca o plano/preço, mas preserva o ciclo atual.
        await tx
          .update(subscriptions)
          .set({
            planId: linkedUpgrade.toPlanId,
            priceCents: linkedUpgrade.toPriceCents,
            status: "ACTIVE",
            restrictedAt: null,
            suspendedAt: null,
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.id, subscription.id));

        await tx
          .update(subscriptionUpgrades)
          .set({
            status: "CONFIRMED",
            confirmedAt: paidAt,
            updatedAt: new Date(),
          })
          .where(eq(subscriptionUpgrades.id, linkedUpgrade.id));

        await tx.insert(auditLogs).values({
          tenantId: input.tenantId,
          actorType: input.actorType,
          actorId: input.actorId ?? null,
          action: "upgrade.confirmed",
          entityType: "subscription_upgrade",
          entityId: linkedUpgrade.id,
          after: { planId: linkedUpgrade.toPlanId, priceCents: linkedUpgrade.toPriceCents },
        });
      } else {
        await tx
          .update(subscriptions)
          .set({
            status: "ACTIVE",
            startedAt: subscription.startedAt ?? paidAt,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            nextDueDate,
            restrictedAt: null,
            suspendedAt: null,
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.id, subscription.id));
      }

      if (!isUpgradeInvoice && fromStatus !== "ACTIVE") {
        await tx.insert(subscriptionStatusHistory).values({
          tenantId: input.tenantId,
          subscriptionId: subscription.id,
          fromStatus,
          toStatus: "ACTIVE",
          reason: `payment:${invoice.id}`,
          actorType: input.actorType,
          actorId: input.actorId ?? null,
        });
      }
    }

    if (invoice.appliedGrantId) {
      await tx
        .update(subscriptionGrants)
        .set({
          cyclesUsed: sql`${subscriptionGrants.cyclesUsed} + 1`,
          status: sql`CASE WHEN ${subscriptionGrants.durationCycles} IS NOT NULL AND ${subscriptionGrants.cyclesUsed} + 1 >= ${subscriptionGrants.durationCycles} THEN 'CONSUMED' ELSE ${subscriptionGrants.status} END`,
          updatedAt: new Date(),
        })
        .where(eq(subscriptionGrants.id, invoice.appliedGrantId));
    }

    await tx.insert(auditLogs).values({
      tenantId: input.tenantId,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      action: "invoice.paid",
      entityType: "invoice",
      entityId: invoice.id,
      before: { status: invoice.status },
      after: {
        status: "PAID",
        totalCents: invoice.totalCents,
        gateway: input.gateway,
        gatewayPaymentId: input.gatewayPaymentId,
      },
    });

    return { applied: true };
  });
}

/** Registro manual do admin; o id sintético mantém a UNIQUE de pagamento. */
export async function registerManualPayment(input: {
  tenantId: string;
  invoiceId: string;
  amountCents: number;
  method: PaymentMethod;
  actorId: string;
  note?: string | null;
}): Promise<void> {
  const manualId = `manual:${uuidv7()}`;

  await applyConfirmedPayment({
    tenantId: input.tenantId,
    invoiceId: input.invoiceId,
    gateway: "MANUAL",
    gatewayPaymentId: manualId,
    method: input.method,
    amountCents: input.amountCents,
    paidAt: new Date(),
    raw: { note: input.note ?? null, registeredBy: input.actorId },
    actorType: "ADMIN",
    actorId: input.actorId,
  });
}

/* -------------------------------------------------------------------------- */
/* Inadimplência e estorno                                                    */
/* -------------------------------------------------------------------------- */

export async function markInvoiceOverdue(input: {
  tenantId: string;
  invoiceId: string;
  actorType?: "GATEWAY" | "SYSTEM";
}): Promise<boolean> {
  return withTenant(input.tenantId, async (tx) => {
    const [invoice] = await tx
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, input.invoiceId), eq(invoices.tenantId, input.tenantId)))
      .for("update")
      .limit(1);

    if (!invoice || invoice.status !== "OPEN") return false;

    await tx
      .update(invoices)
      .set({ status: "OVERDUE", updatedAt: new Date() })
      .where(eq(invoices.id, invoice.id));

    const [subscription] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, invoice.subscriptionId))
      .limit(1);

    if (subscription && subscription.status === "ACTIVE") {
      await tx
        .update(subscriptions)
        .set({ status: "PAST_DUE", updatedAt: new Date() })
        .where(eq(subscriptions.id, subscription.id));

      await tx.insert(subscriptionStatusHistory).values({
        tenantId: input.tenantId,
        subscriptionId: subscription.id,
        fromStatus: "ACTIVE",
        toStatus: "PAST_DUE",
        reason: `invoice_overdue:${invoice.id}`,
        actorType: input.actorType ?? "SYSTEM",
      });
    }

    return true;
  });
}

export async function markInvoiceRefunded(input: {
  tenantId: string;
  invoiceId: string;
  gateway: string;
  gatewayPaymentId: string;
}): Promise<boolean> {
  return withTenant(input.tenantId, async (tx) => {
    const [invoice] = await tx
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, input.invoiceId), eq(invoices.tenantId, input.tenantId)))
      .for("update")
      .limit(1);

    if (!invoice || invoice.status === "REFUNDED") return false;

    await tx
      .update(invoices)
      .set({ status: "REFUNDED", updatedAt: new Date() })
      .where(eq(invoices.id, invoice.id));

    await tx
      .update(payments)
      .set({ status: "REFUNDED", updatedAt: new Date() })
      .where(
        and(
          eq(payments.invoiceId, invoice.id),
          eq(payments.gateway, input.gateway),
          eq(payments.gatewayPaymentId, input.gatewayPaymentId),
        ),
      );

    return true;
  });
}

/* -------------------------------------------------------------------------- */
/* Cancelamento de cobrança                                                   */
/* -------------------------------------------------------------------------- */

export async function cancelInvoice(input: {
  tenantId: string;
  invoiceId: string;
  actorId?: string | null;
  reason?: string | null;
}): Promise<InvoiceRow> {
  const invoice = await getInvoice(input.tenantId, input.invoiceId);
  if (!invoice) throw new BillingError("NOT_FOUND", "Fatura não encontrada.");

  if (invoice.status === "PAID") {
    throw new BillingError("PAYMENT_CONFLICT", "Fatura paga não pode ser cancelada; estorne o pagamento.");
  }
  if (invoice.status === "VOID") {
    return invoice;
  }
  if (invoice.status === "REFUNDED") {
    throw new BillingError("PAYMENT_CONFLICT", "Fatura estornada não pode ser cancelada.");
  }

  if (invoice.gatewayInvoiceId) {
    await cancelPayment(invoice.gatewayInvoiceId);
  }

  const [updated] = await withTenant(input.tenantId, async (tx) => {
    const rows = await tx
      .update(invoices)
      .set({ status: "VOID", updatedAt: new Date() })
      .where(and(eq(invoices.id, invoice.id), eq(invoices.tenantId, input.tenantId)))
      .returning();

    // Se a fatura anulada era a entrada de um upgrade pendente, cancela o upgrade
    // para não deixar operação órfã bloqueando novos upgrades.
    await tx
      .update(subscriptionUpgrades)
      .set({ status: "CANCELLED", cancelledAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(subscriptionUpgrades.entryInvoiceId, invoice.id),
          eq(subscriptionUpgrades.tenantId, input.tenantId),
          eq(subscriptionUpgrades.status, "PENDING_PAYMENT"),
        ),
      );

    await tx.insert(auditLogs).values({
      tenantId: input.tenantId,
      actorType: input.actorId ? "USER" : "SYSTEM",
      actorId: input.actorId ?? null,
      action: "invoice.cancelled",
      entityType: "invoice",
      entityId: invoice.id,
      before: { status: invoice.status },
      after: { status: "VOID", reason: input.reason ?? null },
    });

    return rows;
  });

  if (!updated) throw new BillingError("NOT_FOUND", "Fatura não encontrada.");
  return updated;
}

export const voidInvoice = cancelInvoice;
export const cancelCharge = cancelInvoice;

/* -------------------------------------------------------------------------- */
/* Conciliação e renovação                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Segunda fonte de verdade: consulta a cobrança no gateway e aplica o pagamento
 * se ele já estiver confirmado. Usada pelo botão da tela, pelo cron e pelo admin.
 */
export async function reconcileInvoice(input: {
  tenantId: string;
  invoiceId: string;
}): Promise<{ status: "PAID" | "PENDING" | "OVERDUE" | "SKIPPED" }> {
  const invoice = await getInvoice(input.tenantId, input.invoiceId);
  if (!invoice) throw new BillingError("NOT_FOUND", "Fatura não encontrada.");
  if (invoice.status === "PAID") return { status: "PAID" };
  if (!invoice.gatewayInvoiceId) {
    throw new BillingError(
      "GATEWAY_REQUIRED",
      "Esta fatura ainda não tem cobrança no gateway. Gere a cobrança primeiro.",
    );
  }

  const payment = await getPayment(invoice.gatewayInvoiceId);

  if (payment.status === "approved") {
    const amount = centsFromGateway(payment.transaction_amount);
    if (amount === null) throw new BillingError("AMOUNT_MISMATCH", "Gateway sem valor de pagamento.");

    await applyConfirmedPayment({
      tenantId: input.tenantId,
      invoiceId: invoice.id,
      gateway: "MERCADOPAGO",
      gatewayPaymentId: payment.id,
      method: mapPaymentMethod(payment.payment_type_id ?? payment.payment_method_id),
      amountCents: amount,
      paidAt: payment.date_approved ?? payment.date_created,
      raw: payment,
      actorType: "SYSTEM",
      gatewayInvoiceId: payment.id,
      invoiceUrl: payment.ticket_url ?? undefined,
    });

    return { status: "PAID" };
  }

  if (payment.status === "rejected" || payment.status === "cancelled") {
    return { status: "SKIPPED" };
  }

  if (payment.status === "refunded" || payment.status === "charged_back") {
    await markInvoiceRefunded({
      tenantId: input.tenantId,
      invoiceId: invoice.id,
      gateway: "MERCADOPAGO",
      gatewayPaymentId: payment.id,
    });
    return { status: "SKIPPED" };
  }

  return { status: "PENDING" };
}

/** Lista tenants ativos; `tenants` é global e os jobs não têm contexto de sessão. */
export async function listActiveTenantIds(): Promise<string[]> {
  const rows = await getDb()
    .select({ id: tenants.id })
    .from(tenants)
    .where(and(eq(tenants.status, "ACTIVE"), isNull(tenants.deletedAt)));
  return rows.map((row) => row.id);
}

/**
 * Gera a fatura de renovação do mês quando o vencimento chegou. Não cria duas:
 * a fatura aberta (ou uma renovação já emitida para a mesma data) é a barreira.
 */
export async function generateRenewalInvoices(now: Date = new Date()): Promise<number> {
  const horizonDate = new Date(now.getTime());
  horizonDate.setUTCDate(horizonDate.getUTCDate() + 3);
  // Emite a renovação até 3 dias antes: é o que permite o lembrete D-3.
  const horizon = todayIso(horizonDate);
  let created = 0;
  const promoInvoices: Array<{ tenantId: string; invoiceId: string }> = [];

  for (const tenantId of await listActiveTenantIds()) {
    const result = await withTenant(tenantId, async (tx) => {
      const [subscription] = await tx
        .select()
        .from(subscriptions)
        .where(and(eq(subscriptions.tenantId, tenantId), eq(subscriptions.status, "ACTIVE")))
        .limit(1);

      if (!subscription?.nextDueDate || subscription.nextDueDate > horizon) return false;

      const [open] = await tx
        .select({ id: invoices.id })
        .from(invoices)
        .where(
          and(
            eq(invoices.subscriptionId, subscription.id),
            inArray(invoices.status, ["DRAFT", "OPEN", "OVERDUE"]),
          ),
        )
        .limit(1);
      if (open) return false;

      const [already] = await tx
        .select({ id: invoices.id })
        .from(invoices)
        .where(
          and(
            eq(invoices.subscriptionId, subscription.id),
            eq(invoices.kind, "RENEWAL"),
            eq(invoices.dueDate, subscription.nextDueDate),
          ),
        )
        .limit(1);
      if (already) return false;

      const [plan] = await tx
        .select({ name: plans.name })
        .from(plans)
        .where(eq(plans.id, subscription.planId))
        .limit(1);

      const negotiated = await activeDiscount(tx, tenantId, todayIso(now));
      const negotiatedDiscount = resolveDiscountCents(subscription.priceCents, negotiated);

      const grant = await getActiveGrant(tenantId, subscription.id);
      const grantDiscount = grant ? grantDiscountCents(grant, subscription.priceCents) : 0;
      const discountCents = Math.min(subscription.priceCents, negotiatedDiscount + grantDiscount);

      // Inclui valores restantes de upgrades confirmados ainda não faturados.
      const pendingUpgrades = await tx
        .select({ id: subscriptionUpgrades.id, remaining: subscriptionUpgrades.remainingAmountCents })
        .from(subscriptionUpgrades)
        .where(
          and(
            eq(subscriptionUpgrades.tenantId, tenantId),
            eq(subscriptionUpgrades.subscriptionId, subscription.id),
            eq(subscriptionUpgrades.status, "CONFIRMED"),
            eq(subscriptionUpgrades.remainingScheduled, false),
          ),
        );
      const remainingTotal = pendingUpgrades.reduce((sum, u) => sum + (u.remaining ?? 0), 0);

      const totalCents = invoiceTotalCents({
        planAmountCents: subscription.priceCents,
        activationAmountCents: remainingTotal,
        discountCents,
      });
      const appliedGrantId = grant?.id ?? null;

      const [createdInvoice] = await tx.insert(invoices).values({
        tenantId,
        subscriptionId: subscription.id,
        kind: "RENEWAL",
        status: "OPEN",
        planAmountCents: subscription.priceCents,
        activationAmountCents: remainingTotal,
        discountCents,
        totalCents,
        dueDate: subscription.nextDueDate,
        description: `${plan?.name ?? "Plano"} — renovação mensal${remainingTotal > 0 ? " + upgrade" : ""}`,
        appliedGrantId,
      }).returning();

      if (createdInvoice && pendingUpgrades.length > 0) {
        await tx
          .update(subscriptionUpgrades)
          .set({ remainingScheduled: true, remainingInvoiceId: createdInvoice.id, updatedAt: new Date() })
          .where(
            and(
              eq(subscriptionUpgrades.tenantId, tenantId),
              inArray(
                subscriptionUpgrades.id,
                pendingUpgrades.map((u) => u.id),
              ),
            ),
          );
      }

      if (totalCents === 0 && createdInvoice) {
        promoInvoices.push({ tenantId, invoiceId: createdInvoice.id });
      }

      await tx.insert(auditLogs).values({
        tenantId,
        actorType: "SYSTEM",
        action: "invoice.renewal_created",
        entityType: "invoice",
        after: { dueDate: subscription.nextDueDate, totalCents, discountCents },
      });

      return true;
    });

    if (result) created += 1;
  }

  for (const item of promoInvoices) {
    try {
      await applyConfirmedPayment({
        tenantId: item.tenantId,
        invoiceId: item.invoiceId,
        gateway: "PROMOTION",
        gatewayPaymentId: `promotion:${item.invoiceId}`,
        method: "PROMOTIONAL",
        amountCents: 0,
        paidAt: new Date(),
        raw: { source: "promotion" },
        actorType: "SYSTEM",
      });
    } catch {
      // não interrompe a geração das demais faturas
    }
  }

  return created;
}

/** Marca como vencidas as faturas abertas cujo dia já passou. */
export async function markOverdueInvoices(now: Date = new Date()): Promise<number> {
  const today = todayIso(now);
  let changed = 0;

  for (const tenantId of await listActiveTenantIds()) {
    const overdue = await withTenant(tenantId, (tx) =>
      tx
        .select({ id: invoices.id })
        .from(invoices)
        .where(
          and(
            eq(invoices.tenantId, tenantId),
            eq(invoices.status, "OPEN"),
            lt(invoices.dueDate, today),
          ),
        ),
    );

    for (const invoice of overdue) {
      if (await markInvoiceOverdue({ tenantId, invoiceId: invoice.id })) changed += 1;
    }
  }

  return changed;
}

/** Reconcilia todas as faturas abertas com cobrança no gateway. */
export async function reconcileOpenInvoices(): Promise<{
  checked: number;
  paid: number;
  failed: number;
}> {
  let checked = 0;
  let paid = 0;
  let failed = 0;

  for (const tenantId of await listActiveTenantIds()) {
    const open = await withTenant(tenantId, (tx) =>
      tx
        .select({ id: invoices.id })
        .from(invoices)
        .where(
          and(
            eq(invoices.tenantId, tenantId),
            inArray(invoices.status, ["OPEN", "OVERDUE"]),
            sql`${invoices.gatewayInvoiceId} is not null`,
          ),
        ),
    );

    for (const invoice of open) {
      checked += 1;
      try {
        const result = await reconcileInvoice({ tenantId, invoiceId: invoice.id });
        if (result.status === "PAID") paid += 1;
      } catch {
        failed += 1;
      }
    }
  }

  return { checked, paid, failed };
}

/** Trata reembolso/estorno de fatura de upgrade. */
export async function handleUpgradeRefund(input: {
  tenantId: string;
  invoiceId: string;
}): Promise<void> {
  await withTenant(input.tenantId, async (tx) => {
    const [upgrade] = await tx
      .select()
      .from(subscriptionUpgrades)
      .where(eq(subscriptionUpgrades.entryInvoiceId, input.invoiceId))
      .limit(1);
    if (!upgrade) return;

    if (upgrade.status === "CONFIRMED") {
      // Reverte o plano se o reembolso for confirmado.
      const [subscription] = await tx
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, upgrade.subscriptionId))
        .limit(1);
      if (subscription && subscription.planId === upgrade.toPlanId) {
        await tx
          .update(subscriptions)
          .set({
            planId: upgrade.fromPlanId,
            priceCents: upgrade.fromPriceCents,
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.id, subscription.id));
      }
    }

    await tx
      .update(subscriptionUpgrades)
      .set({
        status: "CANCELLED",
        cancelledAt: new Date(),
        remainingScheduled: false,
        updatedAt: new Date(),
      })
      .where(eq(subscriptionUpgrades.id, upgrade.id));
  });
}
