/** Regras puras de reembolso. Sem I/O, testáveis em isolamento. */

export const REFUND_WINDOW_DAYS = 7;

export type RefundStatus =
  | "REQUESTED"
  | "IN_ANALYSIS"
  | "APPROVED"
  | "REJECTED"
  | "PROCESSED"
  | "FAILED";

export const REFUND_STATUSES: RefundStatus[] = [
  "REQUESTED",
  "IN_ANALYSIS",
  "APPROVED",
  "REJECTED",
  "PROCESSED",
  "FAILED",
];

/** Estados terminais: não admitem nova transição. */
export const TERMINAL_REFUND_STATUSES: RefundStatus[] = ["REJECTED", "PROCESSED", "FAILED"];

/** Verifica se a solicitação está dentro do prazo de 7 dias corridos após a confirmação do pagamento. */
export function isWithinRefundWindow(paidAt: Date, now: Date = new Date()): boolean {
  if (Number.isNaN(paidAt.getTime()) || Number.isNaN(now.getTime())) return false;
  const ms = now.getTime() - paidAt.getTime();
  if (ms < 0) return false;
  const days = ms / (1000 * 60 * 60 * 24);
  return days <= REFUND_WINDOW_DAYS;
}

/** Dias corridos decorridos desde a confirmação do pagamento. */
export function daysSincePayment(paidAt: Date, now: Date = new Date()): number {
  if (Number.isNaN(paidAt.getTime()) || Number.isNaN(now.getTime())) return 0;
  const ms = now.getTime() - paidAt.getTime();
  if (ms < 0) return 0;
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

/** Transição válida? */
export function canTransitionRefund(from: RefundStatus, to: RefundStatus): boolean {
  if (from === to) return false;
  if (TERMINAL_REFUND_STATUSES.includes(from)) return false;
  const allowed: Record<RefundStatus, RefundStatus[]> = {
    REQUESTED: ["IN_ANALYSIS", "APPROVED", "REJECTED"],
    IN_ANALYSIS: ["APPROVED", "REJECTED"],
    APPROVED: ["PROCESSED", "FAILED"],
    REJECTED: [],
    PROCESSED: [],
    FAILED: [],
  };
  return allowed[from].includes(to);
}

export const REFUND_STATUS_LABEL: Record<RefundStatus, string> = {
  REQUESTED: "Solicitado",
  IN_ANALYSIS: "Em análise",
  APPROVED: "Aprovado",
  REJECTED: "Recusado",
  PROCESSED: "Processado",
  FAILED: "Falha",
};