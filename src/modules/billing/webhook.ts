import type { MercadoPagoPayment } from "./gateway";
import { getPayment } from "./gateway";
import {
  applyConfirmedPayment,
  getInvoice,
  markInvoiceOverdue,
  markInvoiceRefunded,
} from "./service";
import {
  centsFromGateway,
  mapPaymentMethod,
  parseExternalReference,
} from "./rules";

/**
 * Efeito de uma notificação do Mercado Pago. O endpoint valida a assinatura,
 * registra o evento e chama esta função. Ela consulta o pagamento na API antes
 * de mudar qualquer estado financeiro.
 */

export type MercadoPagoNotification = {
  id?: string | number;
  action?: string;
  type?: string;
  data?: { id?: string | number };
};

export type ProcessedEvent = "PROCESSED" | "IGNORED";

export async function processMercadoPagoEvent(
  notification: MercadoPagoNotification,
): Promise<ProcessedEvent> {
  const paymentId =
    notification.data?.id != null ? String(notification.data.id) : null;
  if (!paymentId) return "IGNORED";

  const payment = await getPaymentFromGateway(paymentId);
  if (!payment) return "IGNORED";

  const reference = parseExternalReference(payment.external_reference);
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

  const status = payment.status ?? "";

  if (status === "approved") {
    const amountCents = centsFromGateway(payment.transaction_amount);
    if (amountCents === null) {
      throw new Error("Evento de pagamento sem valor válido.");
    }

    await applyConfirmedPayment({
      tenantId: reference.tenantId,
      invoiceId: invoice.id,
      gateway: "MERCADOPAGO",
      gatewayPaymentId: payment.id,
      method: mapPaymentMethod(payment.payment_type_id ?? payment.payment_method_id),
      amountCents,
      paidAt: payment.date_approved ?? payment.date_created,
      raw: payment,
      actorType: "GATEWAY",
      gatewayInvoiceId: payment.id,
      invoiceUrl: payment.ticket_url ?? undefined,
    });

    return "PROCESSED";
  }

  if (status === "refunded" || status === "charged_back") {
    await markInvoiceRefunded({
      tenantId: reference.tenantId,
      invoiceId: invoice.id,
      gateway: "MERCADOPAGO",
      gatewayPaymentId: payment.id,
    });
    return "PROCESSED";
  }

  // pending, in_process, rejected, cancelled, etc.: não altera estado financeiro.
  return "PROCESSED";
}

async function getPaymentFromGateway(paymentId: string): Promise<MercadoPagoPayment | null> {
  try {
    return await getPayment(paymentId);
  } catch {
    return null;
  }
}