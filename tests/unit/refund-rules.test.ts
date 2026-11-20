import { describe, expect, it } from "vitest";
import {
  REFUND_WINDOW_DAYS,
  isWithinRefundWindow,
  daysSincePayment,
  canTransitionRefund,
  REFUND_STATUS_LABEL,
} from "@/modules/billing/refund-rules";

describe("janela de reembolso de 7 dias", () => {
  const paidAt = new Date("2026-01-10T12:00:00Z");

  it("permite reembolso no 6º dia", () => {
    const now = new Date("2026-01-16T12:00:00Z");
    expect(isWithinRefundWindow(paidAt, now)).toBe(true);
    expect(daysSincePayment(paidAt, now)).toBe(6);
  });

  it("permite reembolso no 7º dia", () => {
    const now = new Date("2026-01-17T12:00:00Z");
    expect(isWithinRefundWindow(paidAt, now)).toBe(true);
  });

  it("recusa reembolso após o 7º dia", () => {
    const now = new Date("2026-01-18T12:00:00Z");
    expect(isWithinRefundWindow(paidAt, now)).toBe(false);
  });

  it("recusa datas inválidas", () => {
    expect(isWithinRefundWindow(new Date("invalid"), new Date())).toBe(false);
  });

  it("recusa reembolso antes do pagamento", () => {
    const now = new Date("2026-01-09T12:00:00Z");
    expect(isWithinRefundWindow(paidAt, now)).toBe(false);
  });
});

describe("transições de status de reembolso", () => {
  it("permite REQUESTED → IN_ANALYSIS → APPROVED → PROCESSED", () => {
    expect(canTransitionRefund("REQUESTED", "IN_ANALYSIS")).toBe(true);
    expect(canTransitionRefund("IN_ANALYSIS", "APPROVED")).toBe(true);
    expect(canTransitionRefund("APPROVED", "PROCESSED")).toBe(true);
  });

  it("permite REQUESTED → APPROVED diretamente", () => {
    expect(canTransitionRefund("REQUESTED", "APPROVED")).toBe(true);
  });

  it("recusa transição de estado terminal", () => {
    expect(canTransitionRefund("PROCESSED", "FAILED")).toBe(false);
    expect(canTransitionRefund("REJECTED", "APPROVED")).toBe(false);
    expect(canTransitionRefund("FAILED", "PROCESSED")).toBe(false);
  });

  it("recusa transição igual", () => {
    expect(canTransitionRefund("REQUESTED", "REQUESTED")).toBe(false);
  });

  it("labels definidos para todos os estados", () => {
    expect(Object.keys(REFUND_STATUS_LABEL)).toHaveLength(6);
  });
});