import { describe, expect, it } from "vitest";
import {
  formatQuantity,
  isLowStock,
  movementDelta,
  parseMinimumStock,
  parseQuantity,
  requiresReason,
  roundQuantity,
  stockStatus,
} from "@/modules/inventory/rules";

describe("parseQuantity", () => {
  it("aceita vírgula, ponto e até três casas", () => {
    expect(parseQuantity("1,5")).toBe(1.5);
    expect(parseQuantity("1.5")).toBe(1.5);
    expect(parseQuantity("2,250")).toBe(2.25);
    expect(parseQuantity("1.234,567")).toBe(1234.567);
    expect(parseQuantity(" 3 ")).toBe(3);
  });

  it("recusa zero, negativo e entrada ambígua", () => {
    expect(parseQuantity("")).toBeNull();
    expect(parseQuantity(null)).toBeNull();
    expect(parseQuantity("0")).toBeNull();
    expect(parseQuantity("-1")).toBeNull();
    expect(parseQuantity("1,2345")).toBeNull();
    expect(parseQuantity("abc")).toBeNull();
  });
});

describe("parseMinimumStock", () => {
  it("aceita zero para desligar o alerta", () => {
    expect(parseMinimumStock("0")).toBe(0);
    expect(parseMinimumStock("0,000")).toBe(0);
    expect(parseMinimumStock("2,5")).toBe(2.5);
    expect(parseMinimumStock("-1")).toBeNull();
  });
});

describe("movementDelta", () => {
  it("entrada soma e saída/perda subtraem", () => {
    expect(movementDelta({ movementType: "IN", quantity: 2 })).toBe(2);
    expect(movementDelta({ movementType: "OUT", quantity: 0.5 })).toBe(-0.5);
    expect(movementDelta({ movementType: "LOSS", quantity: 1 })).toBe(-1);
  });

  it("ajuste exige direção e respeita o sinal escolhido", () => {
    expect(
      movementDelta({ movementType: "ADJUSTMENT", quantity: 3, adjustmentDirection: "INCREASE" }),
    ).toBe(3);
    expect(
      movementDelta({ movementType: "ADJUSTMENT", quantity: 3, adjustmentDirection: "DECREASE" }),
    ).toBe(-3);
    expect(() => movementDelta({ movementType: "ADJUSTMENT", quantity: 3 })).toThrow();
  });

  it("quantidade zero ou negativa não é movimento", () => {
    expect(() => movementDelta({ movementType: "IN", quantity: 0 })).toThrow();
    expect(() => movementDelta({ movementType: "OUT", quantity: -1 })).toThrow();
  });
});

describe("requiresReason", () => {
  it("só exige motivo em ajuste e perda", () => {
    expect(requiresReason("ADJUSTMENT")).toBe(true);
    expect(requiresReason("LOSS")).toBe(true);
    expect(requiresReason("IN")).toBe(false);
    expect(requiresReason("OUT")).toBe(false);
  });
});

describe("saldo e alerta", () => {
  it("distingue zerado, baixo e ok", () => {
    expect(stockStatus({ quantity: "0", minStock: "5" })).toBe("EMPTY");
    expect(stockStatus({ quantity: "2", minStock: "2" })).toBe("LOW");
    expect(stockStatus({ quantity: "3", minStock: "2" })).toBe("OK");
  });

  it("mínimo zero desliga o alerta de baixo, mas não esconde o zerado", () => {
    expect(isLowStock({ quantity: "1", minStock: "0" })).toBe(false);
    expect(isLowStock({ quantity: "0", minStock: "0" })).toBe(true);
  });
});

describe("formatação e arredondamento", () => {
  it("arredonda na precisão do banco", () => {
    expect(roundQuantity(1.23456)).toBe(1.235);
    expect(roundQuantity(1.0001)).toBe(1);
  });

  it("formata no padrão brasileiro", () => {
    expect(formatQuantity("1.500")).toBe("1,5");
    expect(formatQuantity(2)).toBe("2");
  });
});
