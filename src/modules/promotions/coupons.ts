"use server";

import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, withTenant } from "@/lib/db";
import { coupons, subscriptions } from "@/db/schema/billing";
import { couponRedemptions } from "@/db/schema/promotions";
import { plans } from "@/db/schema/plans";
import { tenants } from "@/db/schema/tenancy";
import { AuthError, requireTenant } from "@/lib/auth";
import { auditPlatformAction } from "@/modules/platform/audit";
import { requireRecentPlatformAdmin } from "@/lib/platform-auth";
import { createGrant, grantDiscountCents } from "./grants";
import { getActiveGrant } from "./grants";

function now() {
  return new Date();
}

export async function validateCoupon(input: {
  tenantId: string;
  code: string;
}): Promise<{ coupon: typeof coupons.$inferSelect; perTenantUsed: number }> {
  const code = input.code.trim().toUpperCase();
  const [coupon] = await getDb().select().from(coupons).where(eq(coupons.code, code)).limit(1);
  if (!coupon) throw new Error("Cupom não encontrado.");
  if (!coupon.isActive) throw new Error("Cupom inativo.");
  const n = now();
  if (coupon.validFrom && coupon.validFrom.getTime() > n.getTime()) throw new Error("Cupom ainda não válido.");
  if (coupon.validTo && coupon.validTo.getTime() < n.getTime()) throw new Error("Cupom expirado.");
  if (coupon.maxRedemptions && coupon.redemptions >= coupon.maxRedemptions) throw new Error("Cupom esgotado.");

  const rows = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(couponRedemptions)
    .where(and(eq(couponRedemptions.couponId, coupon.id), eq(couponRedemptions.tenantId, input.tenantId)));
  const count = rows[0]?.count ?? 0;
  if (count >= coupon.maxPerTenant) throw new Error("Você já utilizou este cupom.");

  return { coupon, perTenantUsed: count };
}

export async function applyCoupon(input: {
  tenantId: string;
  userId: string;
  code: string;
}) {
  const { coupon } = await validateCoupon({ tenantId: input.tenantId, code: input.code });

  const [subscription] = await withTenant(input.tenantId, (tx) =>
    tx
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.tenantId, input.tenantId), eq(subscriptions.status, "ACTIVE")))
      .limit(1),
  );
  const [subAny] = subscription
    ? [subscription]
    : await withTenant(input.tenantId, (tx) =>
        tx.select().from(subscriptions).where(eq(subscriptions.tenantId, input.tenantId)).limit(1),
      );
  if (!subAny) throw new Error("Nenhuma assinatura encontrada.");

  if (coupon.appliesToPlanId && subAny.planId !== coupon.appliesToPlanId) {
    throw new Error("Cupom não aplicável ao seu plano.");
  }

  // If coupon plan specified and different, optionally update subscription plan.
  if (coupon.appliesToPlanId && subAny.planId !== coupon.appliesToPlanId) {
    const [plan] = await getDb().select().from(plans).where(eq(plans.id, coupon.appliesToPlanId)).limit(1);
    if (plan) {
      await withTenant(input.tenantId, (tx) =>
        tx
          .update(subscriptions)
          .set({ planId: plan.id, priceCents: plan.priceCents, activationFeeCents: plan.activationFeeCents, updatedAt: new Date() })
          .where(eq(subscriptions.id, subAny.id)),
      );
    }
  }

  const grantType =
    coupon.discountType === "FREE"
      ? "FREE"
      : coupon.discountType === "ACTIVATION"
        ? "ACTIVATION"
        : coupon.discountType === "PERCENT"
          ? "PERCENT"
          : "FIXED";

  const grant = await createGrant({
    tenantId: input.tenantId,
    subscriptionId: subAny.id,
    sourceType: "COUPON",
    sourceId: coupon.id,
    planId: coupon.appliesToPlanId,
    grantType,
    value: coupon.value,
    waiveActivationFee: coupon.appliesToActivation,
    durationCycles: coupon.durationCycles ?? 1,
    createdBy: input.userId,
  });

  await getDb().insert(couponRedemptions).values({
    couponId: coupon.id,
    tenantId: input.tenantId,
    userId: input.userId,
    grantId: grant.id,
    originalAmountCents: subAny.priceCents,
    discountCents: grantDiscountCents(grant, subAny.priceCents),
    finalAmountCents: Math.max(0, subAny.priceCents - grantDiscountCents(grant, subAny.priceCents)),
  });

  await getDb()
    .update(coupons)
    .set({ redemptions: sql`${coupons.redemptions} + 1` })
    .where(eq(coupons.id, coupon.id));

  return { grantId: grant.id, message: "Cupom aplicado com sucesso." };
}

export async function listCouponRedemptions(tenantId?: string) {
  const base = getDb()
    .select({
      redemption: couponRedemptions,
      couponCode: coupons.code,
      tenantTradeName: tenants.tradeName,
    })
    .from(couponRedemptions)
    .innerJoin(coupons, eq(coupons.id, couponRedemptions.couponId))
    .innerJoin(tenants, eq(tenants.id, couponRedemptions.tenantId))
    .orderBy(desc(couponRedemptions.redeemedAt))
    .limit(200);
  if (tenantId) {
    return base.where(eq(couponRedemptions.tenantId, tenantId));
  }
  return base;
}
