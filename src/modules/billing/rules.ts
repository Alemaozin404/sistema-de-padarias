import { timingSafeEqual } from "node:crypto";

/**
 * Regras puras de cobrança. Nada aqui fala com o banco ou com o gateway: são as
 * contas que precisam bater entre a fatura, o checkout e o webhook.
 */

export type PaymentMethod = "PIX" | "CARD" | "BOLETO";

export type InvoiceAmounts = {
  planAmountCents: number;
  activationAmountCents: number;
  discountCents?: number;
  fineCents?: number;
  interestCents?: number;
};

/** `total = plano + ativação + multa + juros - desconto`. */
export function invoiceTotalCents(input: InvoiceAmounts): number {
  const amounts = [
    input.planAmountCents,
    input.activationAmountCents,
    input.discountCents ?? 0,
    input.fineCents ?? 0,
    input.interestCents ?? 0,
  ];

  if (amounts.some((value) => !Number.isInteger(value) || value < 0)) {
    throw new Error("Valores da fatura devem ser inteiros não negativos (centavos).");
  }

  const total =
    input.planAmountCents +
    input.activationAmountCents +
    (input.fineCents ?? 0) +
    (input.interestCents ?? 0) -
    (input.discountCents ?? 0);

  if (total < 0) throw new Error("Desconto maior que o valor da fatura.");
  return total;
}

export function formatCentsInput(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

export type NegotiatedDiscount = {
  discountType: string;
  value: number;
};

/** Desconto nunca ultrapassa a mensalidade nem gera fatura negativa. */
export function resolveDiscountCents(
  planAmountCents: number,
  discount: NegotiatedDiscount | null,
): number {
  if (!discount) return 0;
  const raw =
    discount.discountType === "PERCENT"
      ? Math.round((planAmountCents * discount.value) / 100)
      : discount.value;
  return Math.max(0, Math.min(planAmountCents, raw, planAmountCents));
}

/* -------------------------------------------------------------------------- */
/* Documento                                                                  */
/* -------------------------------------------------------------------------- */

export function normalizeDocument(value: string): string {
  return value.replace(/\D/g, "");
}

/** Validação de dígitos de CPF (11) e CNPJ (14). */
export function isValidDocument(value: string): boolean {
  const digits = normalizeDocument(value);
  if (digits.length !== 11 && digits.length !== 14) return false;
  if (/^(\d)\1+$/.test(digits)) return false;

  if (digits.length === 11) {
    const check = (length: number) => {
      let sum = 0;
      for (let index = 0; index < length; index += 1) {
        sum += Number(digits[index]) * (length + 1 - index);
      }
      const rest = (sum * 10) % 11;
      return rest === 10 ? 0 : rest;
    };
    return check(9) === Number(digits[9]) && check(10) === Number(digits[10]);
  }

  const check = (length: number) => {
    const weights = length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(digits[index]) * weights[index]!;
    }
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  return check(12) === Number(digits[12]) && check(13) === Number(digits[13]);
}

/* -------------------------------------------------------------------------- */
/* Datas e período                                                            */
/* -------------------------------------------------------------------------- */

/** Soma meses em UTC preservando o dia, com clamp no fim do mês. */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function todayIso(now: Date = new Date()): string {
  return isoDate(now);
}

/**
 * Período pago: começa no pagamento e termina um mês depois. O vencimento da
 * próxima fatura é a data final do período.
 */
export function paidPeriod(paidAt: Date): {
  periodStart: Date;
  periodEnd: Date;
  nextDueDate: string;
} {
  const periodEnd = addMonths(paidAt, 1);
  return {
    periodStart: paidAt,
    periodEnd,
    nextDueDate: isoDate(periodEnd),
  };
}

/* -------------------------------------------------------------------------- */
/* Referência externa do gateway                                              */
/* -------------------------------------------------------------------------- */

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const EXTERNAL_REFERENCE = new RegExp(`^(${UUID}):(${UUID})$`, "i");

export function externalReferenceFor(tenantId: string, invoiceId: string): string {
  return `${tenantId}:${invoiceId}`;
}

export function parseExternalReference(
  value: unknown,
): { tenantId: string; invoiceId: string } | null {
  if (typeof value !== "string") return null;
  const match = EXTERNAL_REFERENCE.exec(value);
  if (!match) return null;
  return { tenantId: match[1]!, invoiceId: match[2]! };
}

/* -------------------------------------------------------------------------- */
/* Eventos e status                                                           */
/* -------------------------------------------------------------------------- */

export const PAID_EVENTS = ["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"] as const;

export function isPaidEvent(eventType: string): boolean {
  return (PAID_EVENTS as readonly string[]).includes(eventType);
}

export function mapPaymentMethod(billingType: unknown): PaymentMethod {
  switch (billingType) {
    case "CREDIT_CARD":
      return "CARD";
    case "BOLETO":
      return "BOLETO";
    default:
      return "PIX";
  }
}

/** Compara tokens sem vazar o tamanho ou o prefixo por tempo de resposta. */
export function constantTimeTokenEqual(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Valores em centavos inteiros; o gateway devolve reais com duas casas. */
export function centsFromGateway(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(value * 100);
}
