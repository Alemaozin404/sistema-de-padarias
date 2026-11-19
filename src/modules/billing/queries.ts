import { and, eq, ne } from "drizzle-orm";
import { getDb, withTenant } from "@/lib/db";
import { featureDefinitions, planFeatures, plans, subscriptions, tenants } from "@/db/schema";
import {
  buildEntitlements,
  effectiveSubscriptionStatus,
  type Entitlements,
  type SubscriptionStatus,
} from "@/modules/plans/entitlements";

export type ResolvedFeature = {
  key: string;
  name: string;
  valueType: "BOOLEAN" | "LIMIT" | "UNLIMITED";
  unitLabel: string | null;
  isEnabled: boolean;
  limitValue: number | null;
};

export type SubscriptionSummary = {
  id: string;
  status: SubscriptionStatus;
  priceCents: number;
  activationFeeCents: number;
  nextDueDate: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
};

export type TenantOverview = {
  id: string;
  tradeName: string;
  slug: string;
  subscription: SubscriptionSummary | null;
  entitlements: Entitlements | null;
  features: ResolvedFeature[];
};

export async function getTenantBasic(tenantId: string) {
  const [row] = await getDb()
    .select({ id: tenants.id, tradeName: tenants.tradeName, slug: tenants.slug })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return row ?? null;
}

/**
 * Carrega a assinatura vigente e resolve as permissões.
 * O preço vem do snapshot da assinatura, não da tabela de planos: mudar o preço
 * do plano não altera o que este cliente contratou.
 */
export async function loadEntitlements(tenantId: string): Promise<{
  subscription: SubscriptionSummary;
  entitlements: Entitlements;
  features: ResolvedFeature[];
} | null> {
  const [sub] = await withTenant(tenantId, (tx) =>
    tx
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.tenantId, tenantId), ne(subscriptions.status, "CANCELLED")))
      .limit(1),
  );

  if (!sub) return null;

  const [plan] = await getDb()
    .select()
    .from(plans)
    .where(eq(plans.id, sub.planId))
    .limit(1);

  if (!plan) return null;
  const status = sub.status as SubscriptionStatus;

  // Suspensão administrativa do tenant vale mesmo com assinatura ativa.
  const [tenant] = await getDb()
    .select({ status: tenants.status })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  const effectiveStatus = effectiveSubscriptionStatus(tenant?.status ?? "ACTIVE", status);

  const featureRows = await getDb()
    .select({
      featureKey: planFeatures.featureKey,
      isEnabled: planFeatures.isEnabled,
      limitValue: planFeatures.limitValue,
      name: featureDefinitions.name,
      valueType: featureDefinitions.valueType,
      unitLabel: featureDefinitions.unitLabel,
    })
    .from(planFeatures)
    .innerJoin(featureDefinitions, eq(featureDefinitions.key, planFeatures.featureKey))
    .where(eq(planFeatures.planId, sub.planId));

  const entitlements = buildEntitlements({
    plan: {
      code: plan.code,
      name: plan.name,
      priceCents: sub.priceCents,
      activationFeeCents: sub.activationFeeCents,
    },
    planFeatures: featureRows,
    status: effectiveStatus,
  });

  if (effectiveStatus !== status) {
    entitlements.warning =
      effectiveStatus === "CANCELLED"
        ? "Estabelecimento encerrado pela plataforma. Os dados seguem disponíveis para consulta e exportação."
        : "Estabelecimento suspenso pela plataforma. Os dados e a área de pagamento seguem acessíveis.";
  }

  return {
    subscription: {
      id: sub.id,
      status,
      priceCents: sub.priceCents,
      activationFeeCents: sub.activationFeeCents,
      nextDueDate: sub.nextDueDate,
      currentPeriodEnd: sub.currentPeriodEnd,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    },
    entitlements,
    features: featureRows.map((row) => ({
      key: row.featureKey,
      name: row.name,
      valueType: row.valueType as ResolvedFeature["valueType"],
      unitLabel: row.unitLabel,
      isEnabled: row.isEnabled,
      limitValue: row.limitValue,
    })),
  };
}

export async function getTenantOverview(tenantId: string): Promise<TenantOverview | null> {
  const basic = await getTenantBasic(tenantId);
  if (!basic) return null;

  const loaded = await loadEntitlements(tenantId);

  return {
    ...basic,
    subscription: loaded?.subscription ?? null,
    entitlements: loaded?.entitlements ?? null,
    features: loaded?.features ?? [],
  };
}
