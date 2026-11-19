import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { getDb, withTenant, type Database } from "@/lib/db";
import {
  billingSettings,
  invoices,
  notificationLog,
  subscriptions,
  subscriptionStatusHistory,
  tenants,
} from "@/db/schema";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { listActiveTenantIds } from "@/modules/billing/service";
import { computeLateCharges, invoiceTotal } from "@/modules/shared/money";
import {
  databaseStatus,
  nextStatus,
  notificationsDue,
  parseDunningSchedule,
  relativeDays,
  statusForDelay,
  type DunningSettings,
  type DunningStatus,
  type DunningStep,
} from "./schedule";
import { renderDunningMessage } from "./templates";

/**
 * Execução diária da régua. Em modo aviso (`enforceRestrictions = false`) o
 * sistema notifica e marca PAST_DUE, mas não aplica multa, juros, restrição
 * nem suspensão. Só com a régua validada os efeitos de travamento entram.
 */

export type DunningRuntimeSettings = DunningSettings & {
  finePercent: number;
  interestPercentMonth: number;
};

export type DunningRunResult = {
  notifications: number;
  sent: number;
  skipped: number;
  failed: number;
  transitions: number;
  charges: number;
};

const DEFAULT_SETTINGS: DunningRuntimeSettings = {
  schedule: parseDunningSchedule(null),
  restrictAfterDays: 5,
  suspendAfterDays: 10,
  cancelAfterDays: 15,
  enforceRestrictions: false,
  finePercent: 2,
  interestPercentMonth: 1,
};

function nonNegativeInt(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : fallback;
}

function nonNegativeNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export async function loadDunningSettings(): Promise<DunningRuntimeSettings> {
  const [row] = await getDb()
    .select()
    .from(billingSettings)
    .where(eq(billingSettings.id, 1))
    .limit(1);

  if (!row) return DEFAULT_SETTINGS;

  const restrict = nonNegativeInt(row.restrictAfterDays, DEFAULT_SETTINGS.restrictAfterDays);
  const suspend = Math.max(
    restrict,
    nonNegativeInt(row.suspendAfterDays, DEFAULT_SETTINGS.suspendAfterDays),
  );
  const cancel = Math.max(
    suspend,
    nonNegativeInt(row.cancelAfterDays, DEFAULT_SETTINGS.cancelAfterDays),
  );

  return {
    schedule: parseDunningSchedule(row.dunningSchedule),
    restrictAfterDays: restrict,
    suspendAfterDays: suspend,
    cancelAfterDays: cancel,
    enforceRestrictions: row.enforceRestrictions,
    finePercent: nonNegativeNumber(row.finePercent, DEFAULT_SETTINGS.finePercent),
    interestPercentMonth: nonNegativeNumber(
      row.interestPercentMonth,
      DEFAULT_SETTINGS.interestPercentMonth,
    ),
  };
}

function parseDueDate(value: string): Date {
  return new Date(`${value}T12:00:00Z`);
}

function displayDate(value: string): string {
  const date = parseDueDate(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(date);
}

type EmailJob = {
  notificationId: string;
  tenantId: string;
  template: string;
  channel: string;
  tenantName: string;
  tenantEmail: string | null;
  invoiceUrl: string | null;
  amountCents: number;
  dueDate: string;
  daysOverdue: number;
};

type TenantRun = {
  notifications: number;
  transitions: number;
  charges: number;
  emails: EmailJob[];
};

const DUNNING_STATUSES = ["ACTIVE", "PAST_DUE", "RESTRICTED", "SUSPENDED"] as const;

function asDunningStatus(status: string): DunningStatus {
  return (DUNNING_STATUSES as readonly string[]).includes(status)
    ? (status as DunningStatus)
    : "PAST_DUE";
}

async function processTenant(
  tx: Database,
  tenantId: string,
  settings: DunningRuntimeSettings,
  now: Date,
): Promise<TenantRun> {
  const [tenant] = await tx
    .select({ tradeName: tenants.tradeName, email: tenants.email })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant) return { notifications: 0, transitions: 0, charges: 0, emails: [] };

  const today = now.toISOString().slice(0, 10);
  const horizonDate = new Date(now.getTime());
  horizonDate.setUTCDate(horizonDate.getUTCDate() + 3);
  const horizon = horizonDate.toISOString().slice(0, 10);

  const pending = await tx
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.tenantId, tenantId),
        inArray(invoices.status, ["OPEN", "OVERDUE"]),
        lte(invoices.dueDate, horizon),
      ),
    )
    .orderBy(asc(invoices.dueDate));

  let notificationCount = 0;
  let chargeCount = 0;
  const emails: EmailJob[] = [];
  const emailJobs: Array<{
    step: DunningStep;
    notificationId: string;
    invoice: (typeof pending)[number];
    daysOverdue: number;
  }> = [];

  for (const invoice of pending) {
    const dueDate = parseDueDate(invoice.dueDate);
    const late = relativeDays(dueDate, now);

    let currentInvoice = invoice;

    if (invoice.status === "OPEN" && invoice.dueDate < today) {
      const [updated] = await tx
        .update(invoices)
        .set({ status: "OVERDUE", updatedAt: now })
        .where(and(eq(invoices.id, invoice.id), eq(invoices.status, "OPEN")))
        .returning();
      if (updated) currentInvoice = updated;
    }

    // Encargos só entram em fatura sem cobrança emitida. Mutar o valor de um Pix
    // já gerado faria o webhook recusar um pagamento legítimo; a próxima cobrança
    // já nasce com o total atualizado.
    if (
      settings.enforceRestrictions &&
      late > 0 &&
      !currentInvoice.gatewayInvoiceId
    ) {
      const charges = computeLateCharges({
        principalCents: currentInvoice.planAmountCents,
        daysOverdue: late,
        finePercent: settings.finePercent,
        interestPercentMonth: settings.interestPercentMonth,
      });

      const totalCents = invoiceTotal({
        planAmountCents: currentInvoice.planAmountCents,
        activationAmountCents: currentInvoice.activationAmountCents,
        discountCents: currentInvoice.discountCents,
        fineCents: charges.fineCents,
        interestCents: charges.interestCents,
      });

      if (
        totalCents !== currentInvoice.totalCents ||
        charges.fineCents !== currentInvoice.fineCents ||
        charges.interestCents !== currentInvoice.interestCents
      ) {
        const [updated] = await tx
          .update(invoices)
          .set({
            fineCents: charges.fineCents,
            interestCents: charges.interestCents,
            totalCents,
            updatedAt: now,
          })
          .where(eq(invoices.id, currentInvoice.id))
          .returning();

        if (updated) {
          currentInvoice = updated;
          chargeCount += 1;
        }
      }
    }

    const due = notificationsDue({
      invoiceId: currentInvoice.id,
      dueDate,
      reference: now,
      schedule: settings.schedule,
    });

    for (const step of due) {
      const [created] = await tx
        .insert(notificationLog)
        .values({
          tenantId,
          invoiceId: currentInvoice.id,
          channel: step.channel,
          template: step.template,
          scheduledFor: now,
          status: "SCHEDULED",
          dedupeKey: step.dedupeKey,
        })
        .onConflictDoNothing()
        .returning({ id: notificationLog.id });

      if (!created) continue;

      notificationCount += 1;
      emailJobs.push({
        step,
        notificationId: created.id,
        invoice: currentInvoice,
        daysOverdue: late,
      });
    }
  }

  // Uma única transição por execução, guiada pela fatura mais antiga. O cron
  // diário percorre PAST_DUE → RESTRICTED → SUSPENDED na ordem dos prazos.
  const oldest = pending.find((invoice) => relativeDays(parseDueDate(invoice.dueDate), now) > 0);
  let transitionCount = 0;

  if (oldest) {
    const [subscription] = await tx
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.tenantId, tenantId), eq(subscriptions.id, oldest.subscriptionId)))
      .for("update")
      .limit(1);

    if (subscription && subscription.status !== "CANCELLED") {
      const days = relativeDays(parseDueDate(oldest.dueDate), now);
      const target = databaseStatus(
        statusForDelay({
          dueDate: parseDueDate(oldest.dueDate),
          reference: now,
          settings,
        }).status,
      );
      const currentForSeverity =
        subscription.status === "PENDING" ? "ACTIVE" : asDunningStatus(subscription.status);
      const next = nextStatus(currentForSeverity, target);

      if (next !== currentForSeverity) {
        const updates: Partial<typeof subscriptions.$inferInsert> = {
          status: next,
          updatedAt: now,
        };
        if (next === "RESTRICTED") updates.restrictedAt = now;
        if (next === "SUSPENDED") updates.suspendedAt = now;

        await tx
          .update(subscriptions)
          .set(updates)
          .where(eq(subscriptions.id, subscription.id));

        await tx.insert(subscriptionStatusHistory).values({
          tenantId,
          subscriptionId: subscription.id,
          fromStatus: subscription.status,
          toStatus: next,
          reason: `dunning:${days}d:${target}`,
          actorType: "SYSTEM",
        });

        transitionCount += 1;
      }
    }
  }

  for (const job of emailJobs) {
    emails.push({
      notificationId: job.notificationId,
      tenantId,
      template: job.step.template,
      channel: job.step.channel,
      tenantName: tenant.tradeName,
      tenantEmail: tenant.email,
      invoiceUrl: job.invoice.invoiceUrl,
      amountCents: job.invoice.totalCents,
      dueDate: job.invoice.dueDate,
      daysOverdue: job.daysOverdue,
    });
  }

  return {
    notifications: notificationCount,
    transitions: transitionCount,
    charges: chargeCount,
    emails,
  };
}

async function deliver(job: EmailJob): Promise<"SENT" | "SKIPPED" | "FAILED"> {
  const tenantId = job.tenantId;

  if (job.channel !== "EMAIL") {
    await withTenant(tenantId, (tx) =>
      tx
        .update(notificationLog)
        .set({ status: "SKIPPED", error: "Canal ainda não automatizado." })
        .where(eq(notificationLog.id, job.notificationId)),
    );
    return "SKIPPED";
  }

  if (!isEmailConfigured()) {
    await withTenant(tenantId, (tx) =>
      tx
        .update(notificationLog)
        .set({ status: "SKIPPED", error: "Envio de e-mail não configurado." })
        .where(eq(notificationLog.id, job.notificationId)),
    );
    return "SKIPPED";
  }

  if (!job.tenantEmail) {
    await withTenant(tenantId, (tx) =>
      tx
        .update(notificationLog)
        .set({ status: "SKIPPED", error: "Estabelecimento sem e-mail de cobrança." })
        .where(eq(notificationLog.id, job.notificationId)),
    );
    return "SKIPPED";
  }

  const message = renderDunningMessage(job.template, {
    tradeName: job.tenantName,
    amountCents: job.amountCents,
    dueDateLabel: displayDate(job.dueDate),
    daysOverdue: job.daysOverdue,
    invoiceUrl: job.invoiceUrl,
  });

  try {
    await sendEmail({
      to: job.tenantEmail,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    await withTenant(tenantId, (tx) =>
      tx
        .update(notificationLog)
        .set({ status: "SENT", sentAt: new Date(), error: null })
        .where(eq(notificationLog.id, job.notificationId)),
    );
    return "SENT";
  } catch (error) {
    await withTenant(tenantId, (tx) =>
      tx
        .update(notificationLog)
        .set({
          status: "FAILED",
          error: error instanceof Error ? error.message.slice(0, 500) : "Falha no envio.",
        })
        .where(eq(notificationLog.id, job.notificationId)),
    );
    return "FAILED";
  }
}

/**
 * Roda a régua para todos os tenants ativos. O retorno alimenta o cron e os
 * testes de simulação; notificações já gravadas nunca são reenviadas.
 */
export async function runDunning(now: Date = new Date()): Promise<DunningRunResult> {
  const settings = await loadDunningSettings();
  const result: DunningRunResult = {
    notifications: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    transitions: 0,
    charges: 0,
  };

  for (const tenantId of await listActiveTenantIds()) {
    let tenantRun: TenantRun;
    try {
      tenantRun = await withTenant(tenantId, (tx) => processTenant(tx, tenantId, settings, now));
    } catch {
      // Uma fatura malformada de um tenant não pode impedir a régua dos demais.
      continue;
    }

    result.notifications += tenantRun.notifications;
    result.transitions += tenantRun.transitions;
    result.charges += tenantRun.charges;

    for (const job of tenantRun.emails) {
      try {
        const status = await deliver(job);
        if (status === "SENT") result.sent += 1;
        if (status === "SKIPPED") result.skipped += 1;
        if (status === "FAILED") result.failed += 1;
      } catch {
        result.failed += 1;
      }
    }
  }

  return result;
}
