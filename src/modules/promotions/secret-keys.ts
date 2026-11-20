"use server";

import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import crypto from "node:crypto";
import { getDb, withTenant } from "@/lib/db";
import { AuthError } from "@/lib/errors";
import { requireRecentPlatformAdmin } from "@/lib/platform-auth";
import {
  secretKeys,
  secretKeyRedemptions,
  subscriptions,
  plans,
  tenants,
} from "@/db/schema";
import { subscriptionGrants } from "@/db/schema/promotions";
import { auditPlatformAction } from "@/modules/platform/audit";
import { createGrant } from "./grants";
import { getActiveGrant } from "./grants";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(): string {
  const bytes = crypto.randomBytes(12);
  let out = "";
  for (let i = 0; i < 12; i += 1) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return `PADARIA-${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}`;
}

function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

export type GeneratedKey = { id: string; code: string; prefix: string };

export async function generateSecretKeys(input: {
  count: number;
  name?: string | null;
  planId?: string | null;
  anyPlan?: boolean;
  grantType?: string;
  value?: number;
  waiveActivationFee?: boolean;
  durationDays?: number | null;
  durationCycles?: number | null;
  lifetime?: boolean;
  expiresAt?: Date | null;
  maxRedemptions?: number;
}): Promise<GeneratedKey[]> {
  const session = await requireRecentPlatformAdmin();
  if (session.role !== "OWNER") {
    throw new AuthError("FORBIDDEN", "Apenas o proprietário pode gerar chaves secretas.");
  }

  const count = Math.min(Math.max(input.count, 1), 500);
  const results: GeneratedKey[] = [];

  for (let i = 0; i < count; i += 1) {
    const code = randomCode();
    const hash = hashCode(code);
    const prefix = code.slice(0, 12);
    const [row] = await getDb()
      .insert(secretKeys)
      .values({
        codeHash: hash,
        codePrefix: prefix,
        name: input.name ?? null,
        planId: input.planId ?? null,
        anyPlan: input.anyPlan ?? false,
        grantType: input.grantType ?? "FREE",
        value: input.value ?? 100,
        waiveActivationFee: input.waiveActivationFee ?? true,
        durationDays: input.durationDays ?? null,
        durationCycles: input.lifetime ? null : (input.durationCycles ?? null),
        lifetime: input.lifetime ?? false,
        maxRedemptions: input.maxRedemptions ?? 1,
        expiresAt: input.expiresAt ?? null,
        createdBy: session.userId,
      })
      .returning({ id: secretKeys.id });

    if (!row) throw new Error("Falha ao gerar chave.");
    results.push({ id: row.id, code, prefix });
  }

  await auditPlatformAction({
    session,
    action: "secret_key.generated",
    entityType: "secret_key",
    entityId: results.map((r) => r.id).join(","),
    after: { count, planId: input.planId ?? null, grantType: input.grantType ?? "FREE" },
  });

  return results;
}

export async function revokeSecretKey(secretKeyId: string): Promise<void> {
  const session = await requireRecentPlatformAdmin();
  if (session.role !== "OWNER") {
    throw new AuthError("FORBIDDEN", "Apenas o proprietário pode revogar chaves.");
  }
  await getDb()
    .update(secretKeys)
    .set({ status: "REVOKED", updatedAt: new Date() })
    .where(eq(secretKeys.id, secretKeyId));
  await auditPlatformAction({
    session,
    action: "secret_key.revoked",
    entityType: "secret_key",
    entityId: secretKeyId,
  });
  revalidatePath("/admin/promocoes");
}

export async function listSecretKeys() {
  return getDb()
    .select({
      key: secretKeys,
      planName: plans.name,
    })
    .from(secretKeys)
    .leftJoin(plans, eq(plans.id, secretKeys.planId))
    .orderBy(desc(secretKeys.createdAt))
    .limit(200);
}

export async function redeemSecretKey(input: {
  tenantId: string;
  userId: string;
  code: string;
}) {
  const code = input.code.trim().toUpperCase();
  if (!code) throw new Error("Informe a chave.");

  const hash = hashCode(code);
  const [key] = await getDb().select().from(secretKeys).where(eq(secretKeys.codeHash, hash)).limit(1);
  if (!key) throw new Error("Chave inválida.");
  if (key.status !== "ACTIVE") throw new Error("Chave inativa ou revogada.");
  if (key.expiresAt && key.expiresAt.getTime() <= Date.now()) throw new Error("Chave expirada.");
  if (key.redemptions >= key.maxRedemptions) throw new Error("Chave já utilizada.");

  // Atomic increment to prevent race.
  const [updated] = await getDb()
    .update(secretKeys)
    .set({ redemptions: sql`${secretKeys.redemptions} + 1`, updatedAt: new Date() })
    .where(
      and(
        eq(secretKeys.id, key.id),
        eq(secretKeys.status, "ACTIVE"),
        sql`${secretKeys.redemptions} < ${secretKeys.maxRedemptions}`,
        or(isNull(secretKeys.expiresAt), sql`${secretKeys.expiresAt} > now()`),
      ),
    )
    .returning({ id: secretKeys.id });

  if (!updated) throw new Error("Chave já utilizada ou expirada.");

  const [subscription] = await withTenant(input.tenantId, (tx) =>
    tx
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.tenantId, input.tenantId), eq(subscriptions.status, "ACTIVE")))
      .limit(1),
  );
  // allow non-active too
  const [subAny] = subscription
    ? [subscription]
    : await withTenant(input.tenantId, (tx) =>
        tx.select().from(subscriptions).where(eq(subscriptions.tenantId, input.tenantId)).limit(1),
      );

  if (!subAny) throw new Error("Nenhuma assinatura encontrada.");

  if (key.planId && !key.anyPlan && subAny.planId !== key.planId) {
    // Update subscription to the granted plan.
    const [plan] = await getDb().select().from(plans).where(eq(plans.id, key.planId)).limit(1);
    if (plan) {
      await withTenant(input.tenantId, (tx) =>
        tx
          .update(subscriptions)
          .set({
            planId: plan.id,
            priceCents: plan.priceCents,
            activationFeeCents: plan.activationFeeCents,
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.id, subAny.id)),
      );
    }
  }

  const grant = await createGrant({
    tenantId: input.tenantId,
    subscriptionId: subAny.id,
    sourceType: "SECRET_KEY",
    sourceId: key.id,
    planId: key.planId,
    grantType: key.grantType,
    value: key.value,
    waiveActivationFee: key.waiveActivationFee,
    durationCycles: key.durationCycles,
    durationDays: key.durationDays,
    lifetime: key.lifetime,
    createdBy: input.userId,
  });

  await getDb().insert(secretKeyRedemptions).values({
    secretKeyId: key.id,
    tenantId: input.tenantId,
    userId: input.userId,
    grantId: grant.id,
  });

  return { grantId: grant.id, message: "Benefício ativado com sucesso." };
}
