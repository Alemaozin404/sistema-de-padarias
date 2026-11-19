import { describe, expect, it } from "vitest";
import {
  databaseStatus,
  DEFAULT_DUNNING_SCHEDULE,
  nextStatus,
  notificationsDue,
  parseDunningSchedule,
  statusForDelay,
  type DunningSettings,
  type DunningStatus,
} from "@/modules/dunning/schedule";
import { renderDunningMessage } from "@/modules/dunning/templates";
import { accessForStatus } from "@/modules/plans/entitlements";
import { computeLateCharges } from "@/modules/shared/money";

const settings: DunningSettings = {
  schedule: DEFAULT_DUNNING_SCHEDULE,
  restrictAfterDays: 5,
  suspendAfterDays: 10,
  cancelAfterDays: 15,
  enforceRestrictions: true,
};

const dueDate = new Date("2026-01-10T12:00:00Z");

function ref(day: number) {
  return new Date(Date.UTC(2026, 0, day, 12, 0, 0));
}

describe("régua de notificações", () => {
  it("dispara só os passos já alcançados", () => {
    // 3 dias antes do vencimento: apenas o lembrete D-3
    const notifications = notificationsDue({
      invoiceId: "inv-1",
      dueDate,
      reference: ref(7),
      schedule: DEFAULT_DUNNING_SCHEDULE,
    });

    expect(notifications.map((n) => n.dayOffset)).toEqual([-3]);
  });

  it("no dia do vencimento inclui o aviso de pendência", () => {
    const notifications = notificationsDue({
      invoiceId: "inv-1",
      dueDate,
      reference: ref(10),
      schedule: DEFAULT_DUNNING_SCHEDULE,
    });

    expect(notifications.map((n) => n.dayOffset)).toEqual([-3, 0]);
  });

  it("cobre todos os passos em atraso de 16 dias", () => {
    const notifications = notificationsDue({
      invoiceId: "inv-1",
      dueDate,
      reference: ref(26),
      schedule: DEFAULT_DUNNING_SCHEDULE,
    });

    expect(notifications).toHaveLength(DEFAULT_DUNNING_SCHEDULE.length);
  });

  it("dedupeKey é determinístico e único por passo", () => {
    const first = notificationsDue({
      invoiceId: "inv-1",
      dueDate,
      reference: ref(26),
      schedule: DEFAULT_DUNNING_SCHEDULE,
    });
    const second = notificationsDue({
      invoiceId: "inv-1",
      dueDate,
      reference: ref(27),
      schedule: DEFAULT_DUNNING_SCHEDULE,
    });

    // rodar o cron de novo não cria novos eventos
    expect(new Set(first.map((n) => n.dedupeKey)).size).toBe(first.length);
    expect(second.map((n) => n.dedupeKey)).toEqual(first.map((n) => n.dedupeKey));
    expect(first[0]!.dedupeKey).toBe("invoice:inv-1:d-3:EMAIL");
  });
});

describe("simulação de 20 dias de atraso", () => {
  it("percorre ACTIVE → PAST_DUE → RESTRICTED → SUSPENDED e para em SUSPENDED", () => {
    const seen: string[] = [];
    let current: DunningStatus = "ACTIVE";

    for (let day = 10; day <= 30; day += 1) {
      const target = statusForDelay({
        dueDate,
        reference: ref(day),
        settings,
      });
      const next = nextStatus(current, target.status);
      if (next !== current) {
        seen.push(next);
        current = next;
      }
    }

    expect(seen).toEqual(["PAST_DUE", "RESTRICTED", "SUSPENDED", "CANCEL_CANDIDATE"]);
    expect(databaseStatus("CANCEL_CANDIDATE")).toBe("SUSPENDED");
    expect(statusForDelay({ dueDate, reference: ref(30), settings }).daysOverdue).toBe(20);
  });

  it("gera uma notificação por passo, mesmo rodando vários dias seguidos", () => {
    const first = notificationsDue({
      invoiceId: "inv-20",
      dueDate,
      reference: ref(30),
      schedule: DEFAULT_DUNNING_SCHEDULE,
    });
    const rerun = notificationsDue({
      invoiceId: "inv-20",
      dueDate,
      reference: ref(31),
      schedule: DEFAULT_DUNNING_SCHEDULE,
    });

    expect(first).toHaveLength(DEFAULT_DUNNING_SCHEDULE.length);
    expect(new Set(first.map((step) => step.dedupeKey)).size).toBe(first.length);
    expect(rerun.map((step) => step.dedupeKey)).toEqual(first.map((step) => step.dedupeKey));
  });

  it("calcula multa e juros sobre a mensalidade, não sobre a ativação", () => {
    const charges = computeLateCharges({
      principalCents: 3990,
      daysOverdue: 20,
      finePercent: 2,
      interestPercentMonth: 1,
    });

    expect(charges.fineCents).toBe(80);
    expect(charges.interestCents).toBe(27);
    expect(charges.totalCents).toBe(4097);
  });

  it("nenhum estado bloqueia leitura ou exportação", () => {
    for (const status of [
      "PENDING",
      "ACTIVE",
      "PAST_DUE",
      "RESTRICTED",
      "SUSPENDED",
      "CANCELLED",
    ] as const) {
      expect(accessForStatus(status).canReadOwnData, status).toBe(true);
      expect(accessForStatus(status).canExportData, status).toBe(true);
      expect(accessForStatus(status).canAccessBilling, status).toBe(true);
    }
  });
});

describe("configuração e mensagens", () => {
  it("descarta passos inválidos e usa a régua padrão se nada sobrar", () => {
    const parsed = parseDunningSchedule([
      { dayOffset: -3, channel: "EMAIL", template: "due_soon" },
      { dayOffset: "5", channel: "EMAIL", template: "overdue" },
      { dayOffset: 5, channel: "POMBO", template: "overdue" },
      { dayOffset: 5, channel: "EMAIL", template: " " },
    ]);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.template).toBe("due_soon");
    expect(parseDunningSchedule("inválido")).toEqual(DEFAULT_DUNNING_SCHEDULE);
    expect(parseDunningSchedule([])).toEqual(DEFAULT_DUNNING_SCHEDULE);
  });

  it("monta a mensagem com valor e protege HTML do nome", () => {
    const message = renderDunningMessage("suspension_warning", {
      tradeName: "Padaria <A&B>",
      amountCents: 4097,
      dueDateLabel: "10/01/2026",
      daysOverdue: 20,
      invoiceUrl: "https://pay.example/fatura",
    });

    expect(message.subject).toContain("suspensos");
    expect(message.text.replace(/\u00a0/g, " ")).toContain("R$ 40,97");
    expect(message.text).toContain("20 dia(s)");
    expect(message.html).toContain("Padaria &lt;A&amp;B&gt;");
    expect(message.html).not.toContain("<A&B>");
  });
});

describe("estado por atraso", () => {
  it("antes do vencimento está ativo", () => {
    expect(
      statusForDelay({ dueDate, reference: ref(9), settings }).status,
    ).toBe("ACTIVE");
  });

  it("modo aviso nunca restringe nem suspende", () => {
    const warningOnly = { ...settings, enforceRestrictions: false };
    for (const day of [11, 21, 27]) {
      expect(statusForDelay({ dueDate, reference: ref(day), settings: warningOnly }).status).toBe(
        "PAST_DUE",
      );
    }
  });

  it("escala na ordem configurada", () => {
    expect(statusForDelay({ dueDate, reference: ref(16), settings }).status).toBe("RESTRICTED");
    expect(statusForDelay({ dueDate, reference: ref(21), settings }).status).toBe("SUSPENDED");
    expect(statusForDelay({ dueDate, reference: ref(26), settings }).status).toBe(
      "CANCEL_CANDIDATE",
    );
  });

  it("prazos são configuráveis", () => {
    const custom = { ...settings, restrictAfterDays: 30, suspendAfterDays: 60 };
    expect(statusForDelay({ dueDate, reference: ref(21), settings: custom }).status).toBe(
      "PAST_DUE",
    );
  });

  it("nunca regride para um estado mais brando", () => {
    expect(nextStatus("SUSPENDED", "PAST_DUE")).toBe("SUSPENDED");
    expect(nextStatus("PAST_DUE", "SUSPENDED")).toBe("SUSPENDED");
    expect(nextStatus("ACTIVE", "PAST_DUE")).toBe("PAST_DUE");
  });
});
