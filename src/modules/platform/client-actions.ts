"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { getDb, withTenant } from "@/lib/db";
import { plans, subscriptions, tenants } from "@/db/schema";
import { AuthError } from "@/lib/errors";
import { requireRecentPlatformAdmin } from "@/lib/platform-auth";
import { getInvoice, registerManualPayment } from "@/modules/billing/service";
import { auditPlatformAction } from "./audit";

function back(tenantId: string, key: "ok" | "erro", message: string): never {
  redirect(`/admin/clientes/${tenantId}?${key}=${encodeURIComponent(message)}`);
}

function refresh(tenantId: string): void {
  revalidatePath("/admin");
  revalidatePath("/admin/clientes");
  revalidatePath(`/admin/clientes/${tenantId}`);
}

async function ownerSession() {
  const session = await requireRecentPlatformAdmin();
  if (session.role !== "OWNER") {
    throw new AuthError("FORBIDDEN", "Apenas o proprietário pode alterar clientes.");
  }
  return session;
}

const tenantSchema = z.object({ tenantId: z.uuid() });

export async function setTenantStatusAction(formData: FormData): Promise<void> {
  const parsed = tenantSchema.safeParse({ tenantId: formData.get("tenantId") });
  if (!parsed.success) redirect("/admin/clientes?erro=Cliente%20inv%C3%A1lido.");
  const tenantId = parsed.data.tenantId;

  let session;
  try {
    session = await ownerSession();
  } catch (error) {
    back(tenantId, "erro", error instanceof Error ? error.message : "Acesso negado.");
  }

  const status = String(formData.get("status") ?? "");
  if (status !== "ACTIVE" && status !== "SUSPENDED") {
    back(tenantId, "erro", "Status inválido.");
  }

  const [tenant] = await getDb().select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) back(tenantId, "erro", "Cliente não encontrado.");

  await getDb()
    .update(tenants)
    .set({ status, updatedAt: new Date() })
    .where(eq(tenants.id, tenantId));

  await auditPlatformAction({
    session,
    tenantId,
    action: status === "SUSPENDED" ? "tenant.suspended" : "tenant.activated",
    entityType: "tenant",
    entityId: tenantId,
    before: { status: tenant.status },
    after: { status },
  });

  refresh(tenantId);
  back(tenantId, "ok", status === "SUSPENDED" ? "Cliente suspenso." : "Cliente reativado.");
}

export async function changeTenantPlanAction(formData: FormData): Promise<void> {
  const parsed = z
    .object({ tenantId: z.uuid(), planId: z.uuid() })
    .safeParse({ tenantId: formData.get("tenantId"), planId: formData.get("planId") });
  if (!parsed.success) redirect("/admin/clientes?erro=Plano%20inv%C3%A1lido.");
  const { tenantId, planId } = parsed.data;

  let session;
  try {
    session = await ownerSession();
  } catch (error) {
    back(tenantId, "erro", error instanceof Error ? error.message : "Acesso negado.");
  }

  const [plan] = await getDb().select().from(plans).where(eq(plans.id, planId)).limit(1);
  if (!plan) back(tenantId, "erro", "Plano não encontrado.");

  const current = await withTenant(tenantId, (tx) =>
    tx
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.tenantId, tenantId), ne(subscriptions.status, "CANCELLED")))
      .limit(1),
  );

  if (!current[0]) back(tenantId, "erro", "Cliente sem assinatura aberta.");
  const subscription = current[0];

  await withTenant(tenantId, (tx) =>
    tx
      .update(subscriptions)
      .set({ planId: plan.id, priceCents: plan.priceCents, updatedAt: new Date() })
      .where(eq(subscriptions.id, subscription.id)),
  );

  await auditPlatformAction({
    session,
    tenantId,
    action: "subscription.plan_changed",
    entityType: "subscription",
    entityId: subscription.id,
    before: { planId: subscription.planId, priceCents: subscription.priceCents },
    after: { planId: plan.id, priceCents: plan.priceCents },
  });

  refresh(tenantId);
  back(tenantId, "ok", `Plano alterado para ${plan.name}. Vale a partir da próxima fatura.`);
}

const paymentSchema = z.object({
  tenantId: z.uuid(),
  invoiceId: z.uuid(),
  method: z.enum(["PIX", "CARD", "BOLETO"]),
  note: z.string().trim().max(500).optional(),
});

export async function adminRegisterPaymentAction(formData: FormData): Promise<void> {
  const parsed = paymentSchema.safeParse({
    tenantId: formData.get("tenantId"),
    invoiceId: formData.get("invoiceId"),
    method: formData.get("method"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) redirect("/admin/clientes?erro=Dados%20de%20pagamento%20inv%C3%A1lidos.");
  const tenantId = parsed.data.tenantId;

  let session;
  try {
    session = await ownerSession();
  } catch (error) {
    back(tenantId, "erro", error instanceof Error ? error.message : "Acesso negado.");
  }

  const invoice = await getInvoice(tenantId, parsed.data.invoiceId);
  if (!invoice) back(tenantId, "erro", "Fatura não encontrada.");
  if (invoice.status === "PAID") back(tenantId, "erro", "Esta fatura já está paga.");
  if (invoice.status === "VOID" || invoice.status === "REFUNDED") {
    back(tenantId, "erro", "Esta fatura não pode receber pagamento.");
  }

  await registerManualPayment({
    tenantId,
    invoiceId: invoice.id,
    amountCents: invoice.totalCents,
    method: parsed.data.method,
    actorId: session.userId,
    note: parsed.data.note ?? null,
  });

  await auditPlatformAction({
    session,
    tenantId,
    action: "payment.manual_registered",
    entityType: "invoice",
    entityId: invoice.id,
    after: { amountCents: invoice.totalCents, method: parsed.data.method },
  });

  refresh(tenantId);
  back(tenantId, "ok", "Pagamento manual registrado e assinatura atualizada.");
}
