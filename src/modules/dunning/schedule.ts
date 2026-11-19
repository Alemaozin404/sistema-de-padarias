import { daysOverdue } from "@/modules/shared/money";

/**
 * Régua de cobrança. Os prazos vêm do banco (`billing_settings`), nunca do
 * código: o proprietário ajusta sem deploy.
 *
 * Enquanto `enforceRestrictions` for falso, o sistema opera em modo "aviso":
 * envia notificações, mas NÃO aplica multa, restrição nem suspensão.
 */

export type DunningChannel = "EMAIL" | "WHATSAPP_LINK" | "SMS";

export type DunningStep = {
  /** Dias em relação ao vencimento: -3 = três dias antes, 0 = no vencimento. */
  dayOffset: number;
  channel: DunningChannel;
  template: string;
};

export type DunningSettings = {
  schedule: ReadonlyArray<DunningStep>;
  restrictAfterDays: number;
  suspendAfterDays: number;
  cancelAfterDays: number;
  enforceRestrictions: boolean;
};

export type DunningStatus = "ACTIVE" | "PAST_DUE" | "RESTRICTED" | "SUSPENDED" | "CANCEL_CANDIDATE";

export type PendingNotification = DunningStep & { dedupeKey: string };

/** Dias de diferença (data de referência − vencimento). Negativo = ainda não venceu. */
export function relativeDays(dueDate: Date, reference: Date): number {
  return daysOverdue(dueDate, reference);
}

/**
 * Notificações já vencidas para a fatura. O `dedupeKey` é determinístico, então
 * rodar o cron várias vezes no mesmo dia não reenvia nada.
 */
export function notificationsDue(input: {
  invoiceId: string;
  dueDate: Date;
  reference: Date;
  schedule: ReadonlyArray<DunningStep>;
}): PendingNotification[] {
  const offset = relativeDays(input.dueDate, input.reference);

  return input.schedule
    .filter((step) => step.dayOffset <= offset)
    .map((step) => ({
      ...step,
      dedupeKey: `invoice:${input.invoiceId}:d${step.dayOffset}:${step.channel}`,
    }));
}

/**
 * Estado devido pelo atraso. Não aplica nada: apenas informa qual seria.
 * A transição real é registrada em `subscription_status_history`.
 */
export function statusForDelay(input: {
  dueDate: Date;
  reference: Date;
  settings: DunningSettings;
}): { status: DunningStatus; daysOverdue: number } {
  const late = relativeDays(input.dueDate, input.reference);
  const { settings } = input;

  if (late <= 0) return { status: "ACTIVE", daysOverdue: late };

  // Modo aviso: nunca restringe nem suspende sem regra validada.
  if (!settings.enforceRestrictions) {
    return { status: "PAST_DUE", daysOverdue: late };
  }

  if (late >= settings.cancelAfterDays) {
    return { status: "CANCEL_CANDIDATE", daysOverdue: late };
  }
  if (late >= settings.suspendAfterDays) {
    return { status: "SUSPENDED", daysOverdue: late };
  }
  if (late >= settings.restrictAfterDays) {
    return { status: "RESTRICTED", daysOverdue: late };
  }
  return { status: "PAST_DUE", daysOverdue: late };
}

/**
 * Ordem obrigatória de escalada: nenhum estado pode ser pulado, e um status
 * mais grave nunca regride por execução fora de ordem do cron.
 */
const SEVERITY: Record<DunningStatus, number> = {
  ACTIVE: 0,
  PAST_DUE: 1,
  RESTRICTED: 2,
  SUSPENDED: 3,
  CANCEL_CANDIDATE: 4,
};

export function nextStatus(
  current: DunningStatus,
  target: DunningStatus,
): DunningStatus {
  return SEVERITY[target] > SEVERITY[current] ? target : current;
}

/**
 * `CANCEL_CANDIDATE` sinaliza o fim da régua, mas o encerramento é decisão
 * humana. No banco a assinatura permanece SUSPENDED até o admin agir.
 */
export function databaseStatus(
  target: DunningStatus,
): Exclude<DunningStatus, "CANCEL_CANDIDATE"> {
  return target === "CANCEL_CANDIDATE" ? "SUSPENDED" : target;
}

const CHANNELS: ReadonlyArray<DunningChannel> = ["EMAIL", "WHATSAPP_LINK", "SMS"];

/**
 * A configuração vem de `billing_settings.dunning_schedule` (jsonb). Uma linha
 * editada à mão não pode derrubar o cron: passos inválidos são descartados e,
 * se nada sobrar, a régua padrão assume.
 */
export function parseDunningSchedule(value: unknown): ReadonlyArray<DunningStep> {
  if (!Array.isArray(value)) return DEFAULT_DUNNING_SCHEDULE;

  const steps = value.flatMap((item): DunningStep[] => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Record<string, unknown>;
    const dayOffset = candidate.dayOffset;
    const channel = candidate.channel;
    const template = candidate.template;

    if (
      typeof dayOffset !== "number" ||
      !Number.isInteger(dayOffset) ||
      typeof channel !== "string" ||
      !CHANNELS.includes(channel as DunningChannel) ||
      typeof template !== "string" ||
      template.trim().length === 0
    ) {
      return [];
    }

    return [{
      dayOffset,
      channel: channel as DunningChannel,
      template: template.trim().slice(0, 80),
    }];
  });

  return steps.length > 0 ? steps : DEFAULT_DUNNING_SCHEDULE;
}

export const DEFAULT_DUNNING_SCHEDULE: ReadonlyArray<DunningStep> = [
  { dayOffset: -3, channel: "EMAIL", template: "due_soon" },
  { dayOffset: 0, channel: "EMAIL", template: "payment_pending" },
  { dayOffset: 1, channel: "EMAIL", template: "overdue" },
  { dayOffset: 5, channel: "EMAIL", template: "restriction_warning" },
  { dayOffset: 10, channel: "EMAIL", template: "suspension_warning" },
  { dayOffset: 15, channel: "EMAIL", template: "termination_warning" },
];
