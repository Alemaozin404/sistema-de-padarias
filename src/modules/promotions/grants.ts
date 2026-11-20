import { and, eq, isNull, or, sql } from "drizzle-orm";
import { getDb, withTenant } from "@/lib/db";
import { subscriptionGrants } from "@/db/schema/promotions";
import { subscriptions } from "@/db/schema/billing";
import { plans } from "@/db/schema/plans";
import { tenants } from "@/db/schema/tenancy";

export async function getActiveGrant(tenantId: string, subscriptionId: string) {
  const now = new Date().toISOString();
  const [grant] = await getDb()
    .select()
    .from(subscriptionGrants)
    .where(
      and(
        eq(subscriptionGrants.tenantId, tenantId),
        eq(subscriptionGrants.subscriptionId, subscriptionId),
        eq(subscriptionGrants.status, "ACTIVE"),
        or(isNull(subscriptionGrants.endsAt), sql`${subscriptionGrants.endsAt} > ${now}`),
        or(
          isNull(subscriptionGrants.durationCycles),
          sql`${subscriptionGrants.cyclesUsed} < ${subscriptionGrants.durationCycles}`,
        ),
      ),
    )
    .orderBy(subscriptionGrants.createdAt)
    .limit(1);
  return grant ?? null;
}

export async function createGrant(input: {
  tenantId: string;
  subscriptionId: string;
  sourceType: string;
  sourceId?: string | null;
  planId?: string | null;
  grantType: string;
  value: number;
  waiveActivationFee?: boolean;
  durationCycles?: number | null;
  durationDays?: number | null;
  lifetime?: boolean;
  createdBy?: string | null;
}) {
  const startsAt = new Date();
  const endsAt =
    input.lifetime || !input.durationDays
      ? null
      : new Date(startsAt.getTime() + input.durationDays * 24 * 60 * 60 * 1000);

  const [grant] = await getDb()
    .insert(subscriptionGrants)
    .values({
      tenantId: input.tenantId,
      subscriptionId: input.subscriptionId,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      planId: input.planId ?? null,
      grantType: input.grantType,
      value: input.value,
      waiveActivationFee: input.waiveActivationFee ?? false,
      durationCycles: input.lifetime ? null : (input.durationCycles ?? null),
      startsAt,
      endsAt,
      createdBy: input.createdBy ?? null,
    })
    .returning();
  if (!grant) throw new Error("Falha ao criar benefício.");
  return grant;
}

export function grantDiscountCents(
  grant: typeof subscriptionGrants.$inferSelect,
  planAmountCents: number,
): number {
  if (grant.grantType === "FREE") return planAmountCents;
  if (grant.grantType === "PERCENT") {
    return Math.min(planAmountCents, Math.round((planAmountCents * grant.value) / 100));
  }
  if (grant.grantType === "FIXED") {
    return Math.min(planAmountCents, grant.value);
  }
  return 0;
}
