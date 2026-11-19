import type { AsaasPayment } from "./gateway";
import {
  applyConfirmedPayment,
  getInvoice,
  markInvoiceOverdue,
  markInvoiceRefunded,
} from "./service";
import {
  centsFromGateway,
  isPaidEvent,
  mapPaymentMethod,
  parseExternalReference,
} from "./rules";

/**
 * Efeito de um evento Asaas. Só age em cobranças criadas por nós
 * (`externalReference = tenantId:invoiceId`) e confere a fatura antes de mudar
 * qualquer estado financeiro.
 */
export type AsaasEvent = {
  id: string;
  event: string;
  payment?: AsaasPayment;
};

export type ProcessedEvent = "PROCESSED" | "IGNORED";

export async function processAsaasEvent(event: AsaasEvent): Promise<ProcessedEvent> {
  const payment = event.payment;
  if (!payment?.id) return "IGNORED";

  const actionable =
    isPaidEvent(event.event) ||
    event.event === "PAYMENT_OVERDUE" ||
    event.event === "PAYMENT_REFUNDED";
  if (!actionable) return "IGNORED";

  const reference = parseExternalReference(payment.externalReference);
  if (!reference) return "IGNORED";

  const invoice = await getInvoice(reference.tenantId, reference.invoiceId);
  if (!invoice) {
    throw new Error(`Fatura ${reference.invoiceId} do evento não encontrada.`);
  }

  if (invoice.gatewayInvoiceId && invoice.gatewayInvoiceId !== payment.id) {
    throw new Error(
      `Cobrança ${payment.id} não corresponde à fatura ${invoice.id} (${invoice.gatewayInvoiceId}).`,
    );
  }

  if (event.event === "PAYMENT_OVERDUE") {
    await markInvoiceOverdue({
      tenantId: reference.tenantId,
      invoiceId: invoice.id,
      actorType: "GATEWAY",
    });
    return "PROCESSED";
  }

  if (event.event === "PAYMENT_REFUNDED") {
    await markInvoiceRefunded({
      tenantId: reference.tenantId,
      invoiceId: invoice.id,
      gateway: "ASAAS",
      gatewayPaymentId: payment.id,
    });
    return "PROCESSED";
  }

  const amountCents = centsFromGateway(payment.value);
  if (amountCents === null) {
    throw new Error("Evento de pagamento sem valor válido.");
  }

  await applyConfirmedPayment({
    tenantId: reference.tenantId,
    invoiceId: invoice.id,
    gateway: "ASAAS",
    gatewayPaymentId: payment.id,
    method: mapPaymentMethod(payment.billingType),
    amountCents,
    paidAt: payment.paymentDate ?? payment.confirmedDate ?? payment.clientPaymentDate,
    raw: payment,
    actorType: "GATEWAY",
    gatewayInvoiceId: payment.id,
    invoiceUrl: payment.invoiceUrl,
  });

  return "PROCESSED";
}
