"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { featureDefinitions, planFeatures, plans } from "@/db/schema";
import { AuthError } from "@/lib/errors";
import { requireRecentPlatformAdmin } from "@/lib/platform-auth";
import { auditPlatformAction } from "./audit";
import { isNonEmpty, parseLimit, parseMoneyToCents } from "./rules";

function back(key: "ok" | "erro", message: string): never {
  redirect(`/admin/planos?${key}=${encodeURIComponent(message)}`);
}

async function ownerSession() {
  const session = await requireRecentPlatformAdmin();
  if (session.role !== "OWNER") {
    throw new AuthError("FORBIDDEN", "Apenas o proprietário pode alterar planos.");
  }
  return session;
}

export async function updatePlanAction(formData: FormData): Promise<void> {
  let session;
  try {
    session = await ownerSession();
  } catch (error) {
    back("erro", error instanceof Error ? error.message : "Acesso negado.");
  }

  const planId = String(formData.get("planId") ?? "");
  const name = formData.get("name");
  const priceCents = parseMoneyToCents(formData.get("price"));
  const activationFeeCents = parseMoneyToCents(formData.get("activation"));
  const description = String(formData.get("description") ?? "").trim();
  const isActive = formData.get("isActive") === "on";
  const isFeatured = formData.get("isFeatured") === "on";

  if (!z.uuid().safeParse(planId).success) back("erro", "Plano inválido.");
  if (!isNonEmpty(name, 80)) back("erro", "Informe o nome do plano.");
  if (priceCents === null) back("erro", "Preço inválido.");
  if (activationFeeCents === null) back("erro", "Ativação inválida.");

  const [before] = await getDb().select().from(plans).where(eq(plans.id, planId)).limit(1);
  if (!before) back("erro", "Plano não encontrado.");

  const featureRows = await getDb().select().from(featureDefinitions);
  const links = await getDb()
    .select()
    .from(planFeatures)
    .where(eq(planFeatures.planId, planId));

  const updates = featureRows.map((feature) => {
    const enabled = formData.get(`enabled__${feature.key}`) === "on";
    const limit = feature.valueType === "BOOLEAN" ? null : parseLimit(formData.get(`limit__${feature.key}`));
    return {
      planId,
      featureKey: feature.key,
      isEnabled: enabled,
      limitValue: limit,
    };
  });

  await getDb().transaction(async (tx) => {
    await tx
      .update(plans)
      .set({
        name: name.trim(),
        description: description || null,
        priceCents,
        activationFeeCents,
        isActive,
        isFeatured,
        updatedAt: new Date(),
      })
      .where(eq(plans.id, planId));

    for (const row of updates) {
      await tx
        .insert(planFeatures)
        .values(row)
        .onConflictDoUpdate({
          target: [planFeatures.planId, planFeatures.featureKey],
          set: { isEnabled: row.isEnabled, limitValue: row.limitValue },
        });
    }
  });

  await auditPlatformAction({
    session,
    action: "plan.updated",
    entityType: "plan",
    entityId: planId,
    before: {
      name: before.name,
      priceCents: before.priceCents,
      activationFeeCents: before.activationFeeCents,
      isActive: before.isActive,
      features: links.map((link) => ({
        key: link.featureKey,
        enabled: link.isEnabled,
        limit: link.limitValue,
      })),
    },
    after: {
      name: name.trim(),
      priceCents,
      activationFeeCents,
      isActive,
      features: updates.map((row) => ({
        key: row.featureKey,
        enabled: row.isEnabled,
        limit: row.limitValue,
      })),
    },
  });

  revalidatePath("/admin/planos");
  revalidatePath("/planos");
  revalidatePath("/admin");
  back("ok", "Plano atualizado. Novas assinaturas usam os novos valores.");
}
