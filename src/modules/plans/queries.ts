import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { featureDefinitions, planFeatures, plans } from "@/db/schema";

export type PublicFeature = {
  key: string;
  name: string;
  valueType: "BOOLEAN" | "LIMIT" | "UNLIMITED";
  unitLabel: string | null;
  isEnabled: boolean;
  limitValue: number | null;
};

export type PublicPlan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceCents: number;
  activationFeeCents: number;
  isFeatured: boolean;
  features: PublicFeature[];
};

/**
 * Planos exibidos comercialmente. Valores vêm do banco — o proprietário altera
 * preço e limites no painel global sem deploy e sem dado fictício no código.
 */
export async function listPublicPlans(): Promise<PublicPlan[]> {
  const db = getDb();

  const rows = await db
    .select({
      id: plans.id,
      code: plans.code,
      name: plans.name,
      description: plans.description,
      priceCents: plans.priceCents,
      activationFeeCents: plans.activationFeeCents,
      isFeatured: plans.isFeatured,
      sortOrder: plans.sortOrder,
      featureKey: planFeatures.featureKey,
      featureName: featureDefinitions.name,
      valueType: featureDefinitions.valueType,
      unitLabel: featureDefinitions.unitLabel,
      isEnabled: planFeatures.isEnabled,
      limitValue: planFeatures.limitValue,
    })
    .from(plans)
    .leftJoin(planFeatures, eq(planFeatures.planId, plans.id))
    .leftJoin(featureDefinitions, eq(featureDefinitions.key, planFeatures.featureKey))
    .where(eq(plans.isActive, true))
    .orderBy(asc(plans.sortOrder), asc(planFeatures.featureKey));

  const byCode = new Map<string, PublicPlan>();

  for (const row of rows) {
    let plan = byCode.get(row.code);
    if (!plan) {
      plan = {
        id: row.id,
        code: row.code,
        name: row.name,
        description: row.description,
        priceCents: row.priceCents,
        activationFeeCents: row.activationFeeCents,
        isFeatured: row.isFeatured,
        features: [],
      };
      byCode.set(row.code, plan);
    }

    if (row.featureKey && row.featureName && row.valueType) {
      plan.features.push({
        key: row.featureKey,
        name: row.featureName,
        valueType: row.valueType as PublicFeature["valueType"],
        unitLabel: row.unitLabel,
        isEnabled: row.isEnabled ?? false,
        limitValue: row.limitValue ?? null,
      });
    }
  }

  return [...byCode.values()];
}

/** Texto curto de uma feature para a apresentação comercial. */
export function describeFeature(feature: PublicFeature): string {
  if (!feature.isEnabled) return "";
  if (feature.valueType === "BOOLEAN") return feature.name;
  if (feature.limitValue === null) return `${feature.name}: sem limite`;
  return `${feature.name}: até ${feature.limitValue}${feature.unitLabel ? ` ${feature.unitLabel}` : ""}`;
}
