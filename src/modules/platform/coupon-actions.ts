"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, withTenant } from "@/lib/db";
import { coupons, plans, tenantDiscounts, tenants } from "@/db/schema";
import { AuthError } from "@/lib/errors";
import { requireRecentPlatformAdmin } from "@/lib/platform-auth";
import { auditPlatformAction } from "./audit";
import {
  isNonEmpty,
  parseIsoDate,
  parseMoneyToCents,
  parsePositiveInt,
} from "./rules";

function back(key: "ok" | "erro", message: string): never {
  redirect(`/admin/cupons?${key}=${encodeURIComponent(message)}`);
}

async function ownerSession() {
  const session = await requireRecentPlatformAdmin();
  if (session.role !== "OWNER") {
    throw new AuthError("FORBIDDEN", "Apenas o proprietário pode alterar descontos.");
  }
  return session;
}

function parseDiscountValue(type: string, raw: FormDataEntryValue | null): number | null {
  // A coluna `value` é inteira: percentual aceita 1–100, fixo é em centavos.
  return type === "PERCENT" ? parsePositiveInt(raw, 100) : parseMoneyToCents(raw);
}

export async function createCouponAction(formData: FormData): Promise<void> {
  let session;
  try {
    session = await ownerSession();
  } catch (error) {
    back("erro", error instanceof Error ? error.message : "Acesso negado.");
  }

  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const discountType = String(formData.get("discountType") ?? "");
  const value = parseDiscountValue(discountType, formData.get("value"));
  const planIdRaw = String(formData.get("planId") ?? "").trim();
  const maxRaw = String(formData.get("maxRedemptions") ?? "").trim();
  const from = parseIsoDate(formData.get("validFrom"));
  const to = parseIsoDate(formData.get("validTo"));

  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) back("erro", "Código inválido: use 3 a 40 letras/números.");
  if (discountType !== "PERCENT" && discountType !== "FIXED") back("erro", "Tipo inválido.");
  if (value === null) back("erro", "Valor do desconto inválido.");
  if (from && to && to < from) back("erro", "A validade final é anterior à inicial.");
  if (planIdRaw && !z.uuid().safeParse(planIdRaw).success) back("erro", "Plano inválido.");

  let planId: string | null = null;
  if (planIdRaw) {
    const [plan] = await getDb().select({ id: plans.id }).from(plans).where(eq(plans.id, planIdRaw));
    if (!plan) back("erro", "Plano não encontrado.");
    planId = plan.id;
  }

  const maxRedemptions = maxRaw ? parsePositiveInt(maxRaw, 1_000_000) : null;
  if (maxRaw && maxRedemptions === null) back("erro", "Limite de usos inválido.");

  let created: { id: string } | undefined;
  try {
    [created] = await getDb()
      .insert(coupons)
      .values({
        code,
        discountType,
        value,
        appliesToPlanId: planId,
        validFrom: from,
        validTo: to,
        maxRedemptions,
        createdBy: session.userId,
      })
      .returning({ id: coupons.id });
  } catch (error) {
    if (error instanceof Error && /unique|duplicate/i.test(error.message)) {
      back("erro", "Já existe um cupom com este código.");
    }
    back("erro", "Não foi possível criar o cupom.");
  }

  if (!created) back("erro", "Não foi possível criar o cupom.");

  await auditPlatformAction({
    session,
    action: "coupon.created",
    entityType: "coupon",
    entityId: created.id,
    after: { code, discountType, value, appliesToPlanId: planId, maxRedemptions },
  });

  revalidatePath("/admin/cupons");
  back("ok", "Cupom criado.");
}

export async function toggleCouponAction(formData: FormData): Promise<void> {
  let session;
  try {
    session = await ownerSession();
  } catch (error) {
    back("erro", error instanceof Error ? error.message : "Acesso negado.");
  }

  const couponId = String(formData.get("couponId") ?? "");
  if (!z.uuid().safeParse(couponId).success) back("erro", "Cupom inválido.");

  const [coupon] = await getDb().select().from(coupons).where(eq(coupons.id, couponId)).limit(1);
  if (!coupon) back("erro", "Cupom não encontrado.");

  await getDb()
    .update(coupons)
    .set({ isActive: !coupon.isActive })
    .where(eq(coupons.id, couponId));

  await auditPlatformAction({
    session,
    action: coupon.isActive ? "coupon.disabled" : "coupon.enabled",
    entityType: "coupon",
    entityId: couponId,
    before: { isActive: coupon.isActive },
    after: { isActive: !coupon.isActive },
  });

  revalidatePath("/admin/cupons");
  back("ok", coupon.isActive ? "Cupom desativado." : "Cupom ativado.");
}

export async function createTenantDiscountAction(formData: FormData): Promise<void> {
  let session;
  try {
    session = await ownerSession();
  } catch (error) {
    back("erro", error instanceof Error ? error.message : "Acesso negado.");
  }

  const tenantId = String(formData.get("tenantId") ?? "");
  const discountType = String(formData.get("discountType") ?? "");
  const value = parseDiscountValue(discountType, formData.get("value"));
  const from = parseIsoDate(formData.get("validFrom"));
  const to = parseIsoDate(formData.get("validTo"));
  const reason = String(formData.get("reason") ?? "").trim();

  if (!z.uuid().safeParse(tenantId).success) back("erro", "Cliente inválido.");
  if (discountType !== "PERCENT" && discountType !== "FIXED") back("erro", "Tipo inválido.");
  if (value === null) back("erro", "Valor do desconto inválido.");
  if (!from) back("erro", "Informe o início da vigência.");
  if (to && to < from) back("erro", "A validade final é anterior à inicial.");
  if (!isNonEmpty(reason, 500)) back("erro", "Descreva o motivo da negociação.");

  const [tenant] = await getDb()
    .select({ id: tenants.id, tradeName: tenants.tradeName })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!tenant) back("erro", "Cliente não encontrado.");

  const [created] = await withTenant(tenantId, (tx) =>
    tx
      .insert(tenantDiscounts)
      .values({
        tenantId,
        discountType,
        value,
        validFrom: from.toISOString().slice(0, 10),
        validTo: to ? to.toISOString().slice(0, 10) : null,
        reason: reason.trim(),
        createdBy: session.userId,
      })
      .returning({ id: tenantDiscounts.id }),
  );
  if (!created) back("erro", "Não foi possível registrar o desconto.");

  await auditPlatformAction({
    session,
    tenantId,
    action: "tenant_discount.created",
    entityType: "tenant_discount",
    entityId: created.id,
    after: {
      tenantId,
      discountType,
      value,
      validFrom: from.toISOString().slice(0, 10),
      validTo: to ? to.toISOString().slice(0, 10) : null,
      reason: reason.trim(),
    },
  });

  revalidatePath("/admin/cupons");
  revalidatePath(`/admin/clientes/${tenantId}`);
  back("ok", `Desconto registrado para ${tenant.tradeName}.`);
}
