import { describe, expect, it } from "vitest";
import {
  computeLateCharges,
  daysOverdue,
  formatBRL,
  invoiceTotal,
} from "@/modules/shared/money";

describe("dinheiro em centavos", () => {
  it("formata em BRL", () => {
    expect(formatBRL(7990).replace(/\u00a0/g, " ")).toBe("R$ 79,90");
  });

  it("rejeita valores fracionários ou negativos", () => {
    expect(() => formatBRL(-1)).toThrow();
    expect(() => formatBRL(10.5)).toThrow();
  });
});

describe("encargos por atraso", () => {
  const settings = { finePercent: 2, interestPercentMonth: 1 };

  it("não cobra nada antes do vencimento", () => {
    const result = computeLateCharges({
      principalCents: 7990,
      daysOverdue: 0,
      ...settings,
    });
    expect(result).toEqual({ fineCents: 0, interestCents: 0, totalCents: 7990 });
  });

  it("aplica multa única de 2% e juros simples de 1% ao mês pro rata die", () => {
    const result = computeLateCharges({
      principalCents: 7990,
      daysOverdue: 10,
      ...settings,
    });

    // 2% de 7990 = 159,8 → arredonda para cima = 160
    expect(result.fineCents).toBe(160);
    // 1% ao mês por 10 de 30 dias = 26,63 → 27
    expect(result.interestCents).toBe(27);
    expect(result.totalCents).toBe(7990 + 160 + 27);
  });

  it("não calcula juros sobre juros (base é só o principal)", () => {
    const thirtyDays = computeLateCharges({
      principalCents: 10000,
      daysOverdue: 30,
      ...settings,
    });
    const sixtyDays = computeLateCharges({
      principalCents: 10000,
      daysOverdue: 60,
      ...settings,
    });

    expect(thirtyDays.interestCents).toBe(100);
    expect(sixtyDays.interestCents).toBe(200);
    // multa é única, não dobra com o tempo
    expect(thirtyDays.fineCents).toBe(sixtyDays.fineCents);
  });

  it("é determinístico: repetir o cálculo não soma encargos", () => {
    const input = { principalCents: 3990, daysOverdue: 7, ...settings };
    expect(computeLateCharges(input)).toEqual(computeLateCharges(input));
  });
});

describe("consistência da fatura", () => {
  it("total = plano + ativação + multa + juros - desconto", () => {
    expect(
      invoiceTotal({
        planAmountCents: 3990,
        activationAmountCents: 3990,
        discountCents: 500,
        fineCents: 80,
        interestCents: 12,
      }),
    ).toBe(3990 + 3990 + 80 + 12 - 500);
  });

  it("não permite total negativo", () => {
    expect(() =>
      invoiceTotal({
        planAmountCents: 1000,
        activationAmountCents: 0,
        discountCents: 2000,
        fineCents: 0,
        interestCents: 0,
      }),
    ).toThrow();
  });
});

describe("dias de atraso", () => {
  it("conta dias corridos ignorando hora", () => {
    const due = new Date("2026-01-10T23:30:00Z");
    const ref = new Date("2026-01-13T01:00:00Z");
    expect(daysOverdue(due, ref)).toBe(3);
  });

  it("é negativo antes do vencimento", () => {
    expect(daysOverdue(new Date("2026-01-10T12:00:00Z"), new Date("2026-01-08T12:00:00Z"))).toBe(
      -2,
    );
  });
});
