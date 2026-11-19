import { describe, expect, it } from "vitest";
import {
  batchIsEditable,
  computeProductionCost,
  productionFactor,
} from "@/modules/production/rules";

describe("productionFactor", () => {
  it("escala pelo rendimento incluindo a perda no consumo", () => {
    expect(
      productionFactor({ yieldQuantity: 100, producedQuantity: 90, lossQuantity: 10 }),
    ).toBe(1);
    expect(
      productionFactor({ yieldQuantity: 100, producedQuantity: 120, lossQuantity: 0 }),
    ).toBe(1.2);
    expect(
      productionFactor({ yieldQuantity: 100, producedQuantity: 100, lossQuantity: 20 }),
    ).toBe(1.2);
  });

  it("arredonda o fator na precisão do banco", () => {
    expect(
      productionFactor({ yieldQuantity: 3, producedQuantity: 1, lossQuantity: 0 }),
    ).toBe(0.333);
  });

  it("recusa rendimento zero, produção zero e perda negativa", () => {
    expect(() =>
      productionFactor({ yieldQuantity: 0, producedQuantity: 10, lossQuantity: 0 }),
    ).toThrow();
    expect(() =>
      productionFactor({ yieldQuantity: 10, producedQuantity: 0, lossQuantity: 0 }),
    ).toThrow();
    expect(() =>
      productionFactor({ yieldQuantity: 10, producedQuantity: 10, lossQuantity: -1 }),
    ).toThrow();
  });
});

describe("computeProductionCost", () => {
  it("bate com o cálculo manual: consumo, custo total, custo por unidade e perda", () => {
    const cost = computeProductionCost({
      yieldQuantity: 100,
      producedQuantity: 100,
      lossQuantity: 20,
      items: [
        { quantity: 10, unitCostCents: 500 }, // 10 kg × R$ 5,00 = R$ 50,00
        { quantity: 2, unitCostCents: 250 }, // 2 un × R$ 2,50 = R$ 5,00
      ],
    });

    expect(cost.factor).toBe(1.2);
    expect(cost.consumptions).toEqual([
      { quantity: 12, unitCostCents: 500 },
      { quantity: 2.4, unitCostCents: 250 },
    ]);

    // 12 × 500 + 2,4 × 250 = 6000 + 600 = 6600 centavos.
    expect(cost.totalCostCents).toBe(6600);
    // 6600 ÷ 100 unidades boas.
    expect(cost.unitCostCents).toBe(66);
    // 20 de 120 unidades feitas: 6600 × 20/120 = 1100.
    expect(cost.lossCostCents).toBe(1100);
  });

  it("sem perda, o custo da perda é zero e o consumo é só o produzido", () => {
    const cost = computeProductionCost({
      yieldQuantity: 200,
      producedQuantity: 100,
      lossQuantity: 0,
      items: [{ quantity: 10, unitCostCents: 1000 }],
    });

    expect(cost.factor).toBe(0.5);
    expect(cost.consumptions[0]?.quantity).toBe(5);
    expect(cost.totalCostCents).toBe(5000);
    expect(cost.unitCostCents).toBe(50);
    expect(cost.lossCostCents).toBe(0);
  });

  it("arredonda cada consumo a 3 casas antes de somar o custo", () => {
    const cost = computeProductionCost({
      yieldQuantity: 3,
      producedQuantity: 4,
      lossQuantity: 0,
      items: [{ quantity: 1, unitCostCents: 100 }],
    });

    // Fator 1,333; consumo 1,333 (não 1,3333…).
    expect(cost.factor).toBe(1.333);
    expect(cost.consumptions[0]?.quantity).toBe(1.333);
    expect(cost.totalCostCents).toBe(133);
  });

  it("ficha sem insumos custa zero, mas ainda exige produção válida", () => {
    const cost = computeProductionCost({
      yieldQuantity: 10,
      producedQuantity: 10,
      lossQuantity: 0,
      items: [],
    });

    expect(cost.totalCostCents).toBe(0);
    expect(cost.unitCostCents).toBe(0);
    expect(cost.lossCostCents).toBe(0);
  });

  it("recusa item com quantidade zero e custo negativo", () => {
    expect(() =>
      computeProductionCost({
        yieldQuantity: 10,
        producedQuantity: 10,
        lossQuantity: 0,
        items: [{ quantity: 0, unitCostCents: 100 }],
      }),
    ).toThrow();
    expect(() =>
      computeProductionCost({
        yieldQuantity: 10,
        producedQuantity: 10,
        lossQuantity: 0,
        items: [{ quantity: 1, unitCostCents: -1 }],
      }),
    ).toThrow();
  });
});

describe("batchIsEditable", () => {
  it("só fornada planejada aceita conclusão/cancelamento", () => {
    expect(batchIsEditable("PLANNED")).toBe(true);
    expect(batchIsEditable("DONE")).toBe(false);
    expect(batchIsEditable("CANCELLED")).toBe(false);
    expect(batchIsEditable("IN_PROGRESS")).toBe(false);
  });
});
