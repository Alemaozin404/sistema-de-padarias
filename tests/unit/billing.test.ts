import { describe, expect, it } from "vitest";
import {
  addMonths,
  centsFromGateway,
  constantTimeTokenEqual,
  externalReferenceFor,
  invoiceTotalCents,
  isPaidEvent,
  isValidDocument,
  isoDate,
  mapPaymentMethod,
  normalizeDocument,
  paidPeriod,
  parseExternalReference,
} from "@/modules/billing/rules";

describe("total da fatura", () => {
  it("soma mensalidade, ativação, encargos e desconto", () => {
    expect(
      invoiceTotalCents({
        planAmountCents: 5990,
        activationAmountCents: 3990,
      }),
    ).toBe(9980);

    expect(
      invoiceTotalCents({
        planAmountCents: 5990,
        activationAmountCents: 0,
        fineCents: 120,
        interestCents: 60,
        discountCents: 500,
      }),
    ).toBe(5670);
  });

  it("recusa valores negativos, fracionados e desconto maior que a fatura", () => {
    expect(() =>
      invoiceTotalCents({ planAmountCents: -1, activationAmountCents: 0 }),
    ).toThrow();
    expect(() =>
      invoiceTotalCents({ planAmountCents: 10.5, activationAmountCents: 0 }),
    ).toThrow();
    expect(() =>
      invoiceTotalCents({
        planAmountCents: 100,
        activationAmountCents: 0,
        discountCents: 101,
      }),
    ).toThrow();
  });
});

describe("documento", () => {
  it("normaliza e valida CPF e CNPJ com dígito verificador", () => {
    expect(normalizeDocument("529.982.247-25")).toBe("52998224725");
    expect(isValidDocument("529.982.247-25")).toBe(true);
    expect(isValidDocument("11.222.333/0001-81")).toBe(true);
    expect(isValidDocument("529.982.247-24")).toBe(false);
    expect(isValidDocument("11.222.333/0001-80")).toBe(false);
  });

  it("recusa tamanho errado e sequências repetidas", () => {
    expect(isValidDocument("123")).toBe(false);
    expect(isValidDocument("111.111.111-11")).toBe(false);
    expect(isValidDocument("00.000.000/0000-00")).toBe(false);
  });
});

describe("datas do período", () => {
  it("soma meses preservando o dia e ajustando o fim do mês", () => {
    expect(isoDate(addMonths(new Date("2026-01-31T12:00:00Z"), 1))).toBe("2026-02-28");
    expect(isoDate(addMonths(new Date("2024-01-31T12:00:00Z"), 1))).toBe("2024-02-29");
    expect(isoDate(addMonths(new Date("2026-03-31T12:00:00Z"), 1))).toBe("2026-04-30");
  });

  it("vencimento é o fim do período pago", () => {
    const period = paidPeriod(new Date("2026-11-19T15:00:00Z"));
    expect(isoDate(period.periodStart)).toBe("2026-11-19");
    expect(isoDate(period.periodEnd)).toBe("2026-12-19");
    expect(period.nextDueDate).toBe("2026-12-19");
  });
});

describe("referência do gateway", () => {
  it("embute tenant e fatura e só aceita UUIDs", () => {
    const tenantId = "0198f0aa-0000-7000-8000-00000000000a";
    const invoiceId = "0198f0aa-0000-7000-8000-0000000000d1";
    const value = externalReferenceFor(tenantId, invoiceId);

    expect(parseExternalReference(value)).toEqual({ tenantId, invoiceId });
    expect(parseExternalReference(`${tenantId}`)).toBeNull();
    expect(parseExternalReference("cus_123:inv_456")).toBeNull();
    expect(parseExternalReference(null)).toBeNull();
  });
});

describe("eventos e valores", () => {
  it("só RECEIVED e CONFIRMED ativam assinatura", () => {
    expect(isPaidEvent("PAYMENT_RECEIVED")).toBe(true);
    expect(isPaidEvent("PAYMENT_CONFIRMED")).toBe(true);
    expect(isPaidEvent("PAYMENT_OVERDUE")).toBe(false);
    expect(isPaidEvent("PAYMENT_CREATED")).toBe(false);
  });

  it("converte reais do gateway para centavos inteiros", () => {
    expect(centsFromGateway(99.9)).toBe(9990);
    expect(centsFromGateway(0.1 + 0.2)).toBe(30);
    expect(centsFromGateway("99.9")).toBeNull();
    expect(centsFromGateway(Number.NaN)).toBeNull();
  });

  it("mapeia a forma de pagamento", () => {
    expect(mapPaymentMethod("PIX")).toBe("PIX");
    expect(mapPaymentMethod("CREDIT_CARD")).toBe("CARD");
    expect(mapPaymentMethod("BOLETO")).toBe("BOLETO");
    expect(mapPaymentMethod(undefined)).toBe("PIX");
  });
});

describe("token do webhook", () => {
  it("compara em tempo constante e recusa tamanho diferente", () => {
    expect(constantTimeTokenEqual("segredo-123", "segredo-123")).toBe(true);
    expect(constantTimeTokenEqual("segredo-123", "segredo-124")).toBe(false);
    expect(constantTimeTokenEqual("curto", "segredo-123")).toBe(false);
    expect(constantTimeTokenEqual("", "")).toBe(false);
  });
});
