"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { eq } from "drizzle-orm";
import { coupons, plans } from "@/db/schema";
import { AuthError } from "@/lib/errors";
import { requireRecentPlatformAdmin } from "@/lib/platform-auth";
import { auditPlatformAction } from "@/modules/platform/audit";
import { generateSecretKeys, revokeSecretKey } from "./secret-keys";

function back(key: "ok" | "erro", message: string): never {
  redirect(`/admin/promocoes?${key}=${encodeURIComponent(message)}`);
}

function ownerSession() {
  return requireRecentPlatformAdmin().then((session) => {
    if (session.role !== "OWNER") {
      throw new AuthError("FORBIDDEN", "Apenas o proprietário pode alterar promoções.");
    }
    return session;
  });
}

export async function createPromotionCouponAction(formData: FormData): Promise<void> {
  let session;
  try {
    session = await ownerSession();
  } catch (error) {
    back("erro", error instanceof Error ? error.message : "Acesso negado.");
  }

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const discountType = String(formData.get("discountType") ?? "PERCENT");
  const valueRaw = String(formData.get("value") ?? "").trim();
  const planIdRaw = String(formData.get("planId") ?? "").trim();
  const durationRaw = String(formData.get("durationCycles") ?? "").trim();
  const validFrom = String(formData.get("validFrom") ?? "").trim();
  const validTo = String(formData.get("validTo") ?? "").trim();
  const maxRedemptionsRaw = String(formData.get("maxRedemptions") ?? "").trim();
  const maxPerTenantRaw = String(formData.get("maxPerTenant") ?? "1").trim();
  const isPublic = formData.get("isPublic") === "on";
  const appliesToActivation = formData.get("appliesToActivation") === "on";

  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) back("erro", "Código inválido.");
  if (!["PERCENT", "FIXED", "FREE", "ACTIVATION"].includes(discountType)) back("erro", "Tipo inválido.");

  let value = 0;
  if (discountType === "PERCENT") {
    const n = Number(valueRaw.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0 || n > 100) back("erro", "Percentual inválido.");
    value = Math.round(n);
  } else if (discountType === "FIXED") {
    const n = Number(valueRaw.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) back("erro", "Valor inválido.");
    value = Math.round(n * 100);
  } else if (discountType === "FREE") {
    value = 100;
  } else if (discountType === "ACTIVATION") {
    value = 0;
  }

  const durationCycles = durationRaw ? Number(durationRaw) : 1;
  if (!Number.isInteger(durationCycles) || durationCycles < 1 || durationCycles > 100) {
    back("erro", "Duração inválida.");
  }

  const maxRedemptions = maxRedemptionsRaw ? Number(maxRedemptionsRaw) : null;
  if (maxRedemptionsRaw && (!Number.isInteger(maxRedemptions) || (maxRedemptions as number) <= 0)) {
    back("erro", "Limite de usos inválido.");
  }
  const maxPerTenant = Number(maxPerTenantRaw || "1");
  if (!Number.isInteger(maxPerTenant) || maxPerTenant < 1) back("erro", "Limite por cliente inválido.");

  let planId: string | null = null;
  if (planIdRaw) {
    const [plan] = await getDb().select({ id: plans.id }).from(plans).where(eq(plans.id, planIdRaw));
    if (!plan) back("erro", "Plano não encontrado.");
    planId = plan.id;
  }

  const fromDate = validFrom ? new Date(`${validFrom}T00:00:00.000Z`) : null;
  const toDate = validTo ? new Date(`${validTo}T23:59:59.999Z`) : null;
  if (fromDate && toDate && toDate < fromDate) back("erro", "Validade final anterior à inicial.");

  let created: { id: string } | undefined;
  try {
    [created] = await getDb()
      .insert(coupons)
      .values({
        name: name || null,
        description: description || null,
        code,
        discountType,
        value,
        appliesToPlanId: planId,
        appliesToActivation,
        durationCycles,
        isPublic,
        maxPerTenant,
        maxRedemptions,
        validFrom: fromDate,
        validTo: toDate,
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
    action: "promotion_coupon.created",
    entityType: "coupon",
    entityId: created.id,
    after: { code, discountType, value, durationCycles, planId },
  });

  revalidatePath("/admin/promocoes");
  revalidatePath("/admin/cupons");
  back("ok", "Cupom criado.");
}

export async function generateSecretKeysAction(formData: FormData): Promise<void> {
  let session;
  try {
    session = await ownerSession();
  } catch (error) {
    back("erro", error instanceof Error ? error.message : "Acesso negado.");
  }

  const count = Number(formData.get("count") ?? "1");
  const name = String(formData.get("name") ?? "").trim();
  const planIdRaw = String(formData.get("planId") ?? "").trim();
  const grantType = String(formData.get("grantType") ?? "FREE");
  const valueRaw = String(formData.get("value") ?? "100").trim();
  const durationDaysRaw = String(formData.get("durationDays") ?? "").trim();
  const durationCyclesRaw = String(formData.get("durationCycles") ?? "").trim();
  const lifetime = formData.get("lifetime") === "on";
  const expiresRaw = String(formData.get("expiresAt") ?? "").trim();
  const maxRedemptionsRaw = String(formData.get("maxRedemptions") ?? "1").trim();
  const waiveActivation = formData.get("waiveActivation") === "on";
  const anyPlan = formData.get("anyPlan") === "on";

  if (!Number.isInteger(count) || count < 1 || count > 500) back("erro", "Quantidade inválida.");

  let planId: string | null = null;
  if (planIdRaw && !anyPlan) {
    const [plan] = await getDb().select({ id: plans.id }).from(plans).where(eq(plans.id, planIdRaw));
    if (!plan) back("erro", "Plano não encontrado.");
    planId = plan.id;
  }

  let value = grantType === "FREE" ? 100 : Number(valueRaw.replace(",", "."));
  if (grantType === "FIXED") value = Math.round(value * 100);
  if (grantType === "PERCENT" && (!Number.isFinite(value) || value <= 0 || value > 100)) {
    back("erro", "Percentual inválido.");
  }
  if (grantType === "FIXED" && (!Number.isFinite(value) || value <= 0)) back("erro", "Valor inválido.");

  const durationDays = durationDaysRaw ? Number(durationDaysRaw) : null;
  const durationCycles = durationCyclesRaw ? Number(durationCyclesRaw) : null;
  const expiresAt = expiresRaw ? new Date(`${expiresRaw}T23:59:59.999Z`) : null;
  const maxRedemptions = Number(maxRedemptionsRaw || "1");
  if (!Number.isInteger(maxRedemptions) || maxRedemptions < 1) back("erro", "Limite de resgates inválido.");

  const keys = await generateSecretKeys({
    count,
    name: name || null,
    planId,
    anyPlan,
    grantType,
    value: Number.isFinite(value) ? value : 100,
    waiveActivationFee: waiveActivation,
    durationDays,
    durationCycles,
    lifetime,
    expiresAt,
    maxRedemptions,
  });

  // Store generated codes in a temporary cookie? We'll redirect with count only; display not persisted.
  // For UX, redirect to page with ok message; codes cannot be retrieved later.
  revalidatePath("/admin/promocoes");
  back("ok", `${keys.length} chave(s) gerada(s). Copie agora: ${keys.map((k) => k.code).join(", ")}`);
}

export async function revokeSecretKeyAction(formData: FormData): Promise<void> {
  let session;
  try {
    session = await ownerSession();
  } catch (error) {
    back("erro", error instanceof Error ? error.message : "Acesso negado.");
  }
  const id = String(formData.get("secretKeyId") ?? "");
  if (!id) back("erro", "Chave inválida.");
  await revokeSecretKey(id);
  revalidatePath("/admin/promocoes");
  back("ok", "Chave revogada.");
}
