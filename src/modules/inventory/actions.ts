"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTenant } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { auditLogs, ingredients } from "@/db/schema";
import { loadEntitlements } from "@/modules/billing/queries";
import { hasFeature } from "@/modules/plans/entitlements";
import { parsePriceToCents } from "@/modules/catalog/rules";
import { InsufficientStockError, applyStockMovement } from "./ledger";
import {
  isAdjustmentDirection,
  isIngredientUnit,
  isMovementType,
  movementDelta,
  parseMinimumStock,
  parseQuantity,
  requiresReason,
} from "./rules";

/**
 * Escrita do estoque.
 *
 * Ordem: sessão/vínculo → assinatura permite escrita → plano tem estoque →
 * validação → transação única (movimento + saldo + auditoria). O saldo só é
 * alterado junto com o movimento; não existe ação de "editar saldo".
 */

const WRITE_ROLES = ["OWNER", "MANAGER"] as const;

export type InventoryState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
};

function fieldErrorsFrom(issues: z.ZodIssue[]): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !fieldErrors[field]) fieldErrors[field] = issue.message;
  }
  return fieldErrors;
}

/** Motivo pelo qual a escrita no estoque está bloqueada, se houver. */
async function stockWriteError(tenantId: string): Promise<string | null> {
  const loaded = await loadEntitlements(tenantId);

  if (!loaded) return "Nenhuma assinatura ativa encontrada. Fale com o suporte.";
  if (!loaded.entitlements.access.canWriteOperational) {
    return (
      loaded.entitlements.warning ??
      "A edição do estoque está suspensa por pendência financeira."
    );
  }
  if (!hasFeature(loaded.entitlements, "stock.basic")) {
    return "Seu plano não inclui controle de estoque. Faça upgrade para usar este módulo.";
  }

  return null;
}

const ingredientSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Informe o nome do insumo").max(120),
  unit: z.string().trim(),
  cost: z.string().trim().optional().or(z.literal("")),
  minStock: z.string().trim().optional().or(z.literal("")),
  supplier: z.string().trim().max(120).optional().or(z.literal("")),
});

export async function saveIngredientAction(
  _prev: InventoryState,
  formData: FormData,
): Promise<InventoryState> {
  const parsed = ingredientSchema.safeParse({
    id: formData.get("id") || undefined,
    name: formData.get("name"),
    unit: formData.get("unit"),
    cost: formData.get("cost") ?? "",
    minStock: formData.get("minStock") ?? "",
    supplier: formData.get("supplier") ?? "",
  });

  if (!parsed.success) {
    return { error: "Verifique os campos destacados.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const data = parsed.data;

  if (!isIngredientUnit(data.unit)) {
    return { fieldErrors: { unit: "Unidade inválida." } };
  }

  const costCents = data.cost ? parsePriceToCents(data.cost) : 0;
  if (costCents === null) {
    return { fieldErrors: { cost: "Use um valor como 4,50." } };
  }

  const minStock = data.minStock ? parseMinimumStock(data.minStock) : null;
  if (data.minStock && minStock === null) {
    return { fieldErrors: { minStock: "Use uma quantidade como 2,5." } };
  }

  const membership = await requireTenant([...WRITE_ROLES]);
  const gateError = await stockWriteError(membership.tenantId);
  if (gateError) return { error: gateError };

  const isCreate = !data.id;

  try {
    await withTenant(membership.tenantId, async (tx) => {
      if (isCreate) {
        const [created] = await tx
          .insert(ingredients)
          .values({
            tenantId: membership.tenantId,
            name: data.name,
            unit: data.unit,
            costPerUnitCents: costCents ?? 0,
            minStock: String(minStock ?? 0),
            supplier: data.supplier || null,
          })
          .returning({ id: ingredients.id });

        await tx.insert(auditLogs).values({
          tenantId: membership.tenantId,
          actorType: "USER",
          actorId: membership.userId,
          action: "ingredient.created",
          entityType: "ingredient",
          entityId: created?.id,
          after: { name: data.name, unit: data.unit, costCents, minStock: minStock ?? 0 },
        });
        return;
      }

      const [current] = await tx
        .select()
        .from(ingredients)
        .where(
          and(
            eq(ingredients.tenantId, membership.tenantId),
            eq(ingredients.id, data.id as string),
          ),
        )
        .limit(1);
      if (!current) throw new Error("NOT_FOUND");

      await tx
        .update(ingredients)
        .set({
          name: data.name,
          unit: data.unit,
          costPerUnitCents: costCents ?? 0,
          minStock: String(minStock ?? 0),
          supplier: data.supplier || null,
          updatedAt: new Date(),
        })
        .where(
          and(eq(ingredients.tenantId, membership.tenantId), eq(ingredients.id, current.id)),
        );

      await tx.insert(auditLogs).values({
        tenantId: membership.tenantId,
        actorType: "USER",
        actorId: membership.userId,
        action: "ingredient.updated",
        entityType: "ingredient",
        entityId: current.id,
        before: {
          name: current.name,
          unit: current.unit,
          costCents: current.costPerUnitCents,
          minStock: current.minStock,
        },
        after: { name: data.name, unit: data.unit, costCents, minStock: minStock ?? 0 },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return { error: "Insumo não encontrado neste estabelecimento." };
    }
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("unique")) {
      return { fieldErrors: { name: "Já existe um insumo com este nome e unidade." } };
    }
    return { error: "Não foi possível salvar o insumo. Tente novamente." };
  }

  revalidatePath("/estoque");
  return { success: isCreate ? "Insumo cadastrado." : "Insumo atualizado." };
}

export async function archiveIngredientAction(formData: FormData): Promise<void> {
  const ingredientId = String(formData.get("ingredientId") ?? "");
  const membership = await requireTenant([...WRITE_ROLES]);
  if (await stockWriteError(membership.tenantId)) return;

  await withTenant(membership.tenantId, async (tx) => {
    await tx
      .update(ingredients)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(
          eq(ingredients.tenantId, membership.tenantId),
          eq(ingredients.id, ingredientId),
        ),
      );

    await tx.insert(auditLogs).values({
      tenantId: membership.tenantId,
      actorType: "USER",
      actorId: membership.userId,
      action: "ingredient.archived",
      entityType: "ingredient",
      entityId: ingredientId,
    });
  });

  revalidatePath("/estoque");
}

const movementSchema = z.object({
  ingredientId: z.string().min(1, "Escolha o insumo."),
  movementType: z.string().trim(),
  adjustmentDirection: z.string().optional().or(z.literal("")),
  quantity: z.string().trim().min(1, "Informe a quantidade."),
  unitCost: z.string().trim().optional().or(z.literal("")),
  reason: z.string().trim().max(300).optional().or(z.literal("")),
});

export async function recordMovementAction(
  _prev: InventoryState,
  formData: FormData,
): Promise<InventoryState> {
  const parsed = movementSchema.safeParse({
    ingredientId: formData.get("ingredientId"),
    movementType: formData.get("movementType"),
    adjustmentDirection: formData.get("adjustmentDirection") ?? "",
    quantity: formData.get("quantity"),
    unitCost: formData.get("unitCost") ?? "",
    reason: formData.get("reason") ?? "",
  });

  if (!parsed.success) {
    return { error: "Verifique os campos destacados.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const data = parsed.data;

  const movementType = data.movementType;
  if (!isMovementType(movementType)) {
    return { fieldErrors: { movementType: "Tipo de movimento inválido." } };
  }

  const quantity = parseQuantity(data.quantity);
  if (quantity === null) {
    return { fieldErrors: { quantity: "Use uma quantidade maior que zero, como 1,5." } };
  }

  const adjustmentDirection = data.adjustmentDirection || null;
  if (movementType === "ADJUSTMENT") {
    if (!isAdjustmentDirection(adjustmentDirection)) {
      return { fieldErrors: { adjustmentDirection: "Escolha se o ajuste soma ou reduz." } };
    }
  } else if (adjustmentDirection) {
    return { fieldErrors: { adjustmentDirection: "Direção só se aplica a ajustes." } };
  }

  const reason = data.reason || "";
  if (requiresReason(movementType) && reason.length === 0) {
    return { fieldErrors: { reason: "Explique o motivo do ajuste ou da perda." } };
  }

  let unitCostCents: number | null = null;
  if (data.unitCost) {
    unitCostCents = parsePriceToCents(data.unitCost);
    if (unitCostCents === null) {
      return { fieldErrors: { unitCost: "Use um valor como 4,50." } };
    }
  }

  const membership = await requireTenant([...WRITE_ROLES]);
  const gateError = await stockWriteError(membership.tenantId);
  if (gateError) return { error: gateError };

  const normalizedDirection = isAdjustmentDirection(adjustmentDirection)
    ? adjustmentDirection
    : null;

  try {
    movementDelta({
      movementType,
      quantity,
      adjustmentDirection: normalizedDirection,
    });
  } catch {
    return { error: "Movimento inválido." };
  }

  try {
    await withTenant(membership.tenantId, async (tx) => {
      const [ingredient] = await tx
        .select({
          id: ingredients.id,
          name: ingredients.name,
          unit: ingredients.unit,
          costPerUnitCents: ingredients.costPerUnitCents,
          isActive: ingredients.isActive,
        })
        .from(ingredients)
        .where(
          and(
            eq(ingredients.tenantId, membership.tenantId),
            eq(ingredients.id, data.ingredientId),
          ),
        )
        .limit(1);

      if (!ingredient) throw new Error("NOT_FOUND");
      if (!ingredient.isActive) throw new Error("INACTIVE");

      // Custo do snapshot: o informado na entrada ou o cadastrado no insumo.
      const movementCost = unitCostCents ?? ingredient.costPerUnitCents;

      const result = await applyStockMovement(tx, {
        tenantId: membership.tenantId,
        itemType: "INGREDIENT",
        itemId: ingredient.id,
        movementType,
        quantity,
        adjustmentDirection: normalizedDirection,
        unitCostCents: movementCost,
        reason: reason || null,
        createdBy: membership.userId,
      });

      await tx.insert(auditLogs).values({
        tenantId: membership.tenantId,
        actorType: "USER",
        actorId: membership.userId,
        action: "stock.movement",
        entityType: "ingredient",
        entityId: ingredient.id,
        after: {
          movementType,
          adjustmentDirection,
          quantity,
          delta: result.delta,
          balance: result.balance,
          unitCostCents: movementCost,
          reason: reason || null,
        },
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NOT_FOUND") return { error: "Insumo não encontrado neste estabelecimento." };
    if (message === "INACTIVE") return { error: "Este insumo está arquivado. Reative o cadastro antes de movimentar." };
    if (error instanceof InsufficientStockError) {
      return { error: "Saldo insuficiente para esta saída. Registre uma entrada ou um ajuste." };
    }
    return { error: "Não foi possível registrar o movimento. Tente novamente." };
  }

  revalidatePath("/estoque");
  revalidatePath("/dashboard");
  return { success: "Movimento registrado." };
}
