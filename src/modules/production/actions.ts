"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTenant } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import {
  auditLogs,
  ingredients,
  productionBatches,
  productionLosses,
  products,
  recipeItems,
  recipes,
} from "@/db/schema";
import { loadEntitlements } from "@/modules/billing/queries";
import { hasFeature } from "@/modules/plans/entitlements";
import { isProductUnit } from "@/modules/catalog/rules";
import {
  InsufficientStockError,
  applyStockMovement,
} from "@/modules/inventory/ledger";
import { parseMinimumStock, parseQuantity } from "@/modules/inventory/rules";
import { computeProductionCost } from "./rules";

/**
 * Escrita da produção.
 *
 * Concluir uma fornada é a operação crítica: consome cada insumo, dá entrada no
 * produto acabado, registra perdas e grava o custo real — tudo em uma transação.
 * Saldo insuficiente em qualquer insumo desfaz o lote inteiro.
 */

const WRITE_ROLES = ["OWNER", "MANAGER"] as const;

export type ProductionState = {
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

async function productionWriteError(tenantId: string): Promise<string | null> {
  const loaded = await loadEntitlements(tenantId);

  if (!loaded) return "Nenhuma assinatura ativa encontrada. Fale com o suporte.";
  if (!loaded.entitlements.access.canWriteOperational) {
    return (
      loaded.entitlements.warning ??
      "A edição da produção está suspensa por pendência financeira."
    );
  }
  if (!hasFeature(loaded.entitlements, "production.enabled")) {
    return "A gestão de produção está disponível no plano Empresarial. Fale com o suporte para fazer upgrade.";
  }

  return null;
}

const recipeSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Informe o nome da ficha").max(120),
  productId: z.string().min(1, "Escolha o produto gerado."),
  yieldQuantity: z.string().trim().min(1, "Informe o rendimento."),
  yieldUnit: z.string().trim(),
  notes: z.string().trim().max(600).optional().or(z.literal("")),
});

export async function saveRecipeAction(
  _prev: ProductionState,
  formData: FormData,
): Promise<ProductionState> {
  const parsed = recipeSchema.safeParse({
    id: formData.get("id") || undefined,
    name: formData.get("name"),
    productId: formData.get("productId"),
    yieldQuantity: formData.get("yieldQuantity"),
    yieldUnit: formData.get("yieldUnit"),
    notes: formData.get("notes") ?? "",
  });

  if (!parsed.success) {
    return { error: "Verifique os campos destacados.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const data = parsed.data;
  const yieldQuantity = parseQuantity(data.yieldQuantity);
  if (yieldQuantity === null) {
    return { fieldErrors: { yieldQuantity: "Use um rendimento maior que zero, como 20." } };
  }
  if (!isProductUnit(data.yieldUnit)) {
    return { fieldErrors: { yieldUnit: "Unidade inválida." } };
  }

  const membership = await requireTenant([...WRITE_ROLES]);
  const gateError = await productionWriteError(membership.tenantId);
  if (gateError) return { error: gateError };

  const isCreate = !data.id;

  try {
    await withTenant(membership.tenantId, async (tx) => {
      const [product] = await tx
        .select({ id: products.id })
        .from(products)
        .where(
          and(
            eq(products.tenantId, membership.tenantId),
            eq(products.id, data.productId),
            isNull(products.deletedAt),
          ),
        )
        .limit(1);
      if (!product) throw new Error("PRODUCT_NOT_FOUND");

      if (isCreate) {
        const [created] = await tx
          .insert(recipes)
          .values({
            tenantId: membership.tenantId,
            productId: data.productId,
            name: data.name,
            yieldQuantity: yieldQuantity.toFixed(3),
            yieldUnit: data.yieldUnit,
            notes: data.notes || null,
          })
          .returning({ id: recipes.id });

        await tx.insert(auditLogs).values({
          tenantId: membership.tenantId,
          actorType: "USER",
          actorId: membership.userId,
          action: "recipe.created",
          entityType: "recipe",
          entityId: created?.id,
          after: { name: data.name, productId: data.productId, yieldQuantity },
        });
        return;
      }

      const [current] = await tx
        .select()
        .from(recipes)
        .where(and(eq(recipes.tenantId, membership.tenantId), eq(recipes.id, data.id as string)))
        .limit(1);
      if (!current) throw new Error("NOT_FOUND");

      await tx
        .update(recipes)
        .set({
          productId: data.productId,
          name: data.name,
          yieldQuantity: yieldQuantity.toFixed(3),
          yieldUnit: data.yieldUnit,
          notes: data.notes || null,
          updatedAt: new Date(),
        })
        .where(and(eq(recipes.tenantId, membership.tenantId), eq(recipes.id, current.id)));

      await tx.insert(auditLogs).values({
        tenantId: membership.tenantId,
        actorType: "USER",
        actorId: membership.userId,
        action: "recipe.updated",
        entityType: "recipe",
        entityId: current.id,
        before: {
          name: current.name,
          productId: current.productId,
          yieldQuantity: current.yieldQuantity,
        },
        after: { name: data.name, productId: data.productId, yieldQuantity },
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "PRODUCT_NOT_FOUND") return { fieldErrors: { productId: "Produto não encontrado." } };
    if (message === "NOT_FOUND") return { error: "Ficha técnica não encontrada neste estabelecimento." };
    return { error: "Não foi possível salvar a ficha técnica. Tente novamente." };
  }

  revalidatePath("/producao");
  if (data.id) revalidatePath(`/producao/receitas/${data.id}`);
  return { success: isCreate ? "Ficha técnica criada." : "Ficha técnica atualizada." };
}

const recipeItemSchema = z.object({
  recipeId: z.string().min(1),
  ingredientId: z.string().min(1, "Escolha o insumo."),
  quantity: z.string().trim().min(1, "Informe a quantidade."),
});

export async function addRecipeItemAction(
  _prev: ProductionState,
  formData: FormData,
): Promise<ProductionState> {
  const parsed = recipeItemSchema.safeParse({
    recipeId: formData.get("recipeId"),
    ingredientId: formData.get("ingredientId"),
    quantity: formData.get("quantity"),
  });

  if (!parsed.success) {
    return { error: "Verifique os campos destacados.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const quantity = parseQuantity(parsed.data.quantity);
  if (quantity === null) {
    return { fieldErrors: { quantity: "Use uma quantidade maior que zero, como 2,5." } };
  }

  const membership = await requireTenant([...WRITE_ROLES]);
  const gateError = await productionWriteError(membership.tenantId);
  if (gateError) return { error: gateError };

  try {
    await withTenant(membership.tenantId, async (tx) => {
      const [recipe] = await tx
        .select({ id: recipes.id })
        .from(recipes)
        .where(
          and(
            eq(recipes.tenantId, membership.tenantId),
            eq(recipes.id, parsed.data.recipeId),
          ),
        )
        .limit(1);
      if (!recipe) throw new Error("NOT_FOUND");

      const [ingredient] = await tx
        .select({ id: ingredients.id, unit: ingredients.unit, isActive: ingredients.isActive })
        .from(ingredients)
        .where(
          and(
            eq(ingredients.tenantId, membership.tenantId),
            eq(ingredients.id, parsed.data.ingredientId),
          ),
        )
        .limit(1);
      if (!ingredient) throw new Error("INGREDIENT_NOT_FOUND");
      if (!ingredient.isActive) throw new Error("INGREDIENT_INACTIVE");

      const [created] = await tx
        .insert(recipeItems)
        .values({
          tenantId: membership.tenantId,
          recipeId: recipe.id,
          ingredientId: ingredient.id,
          quantity: quantity.toFixed(3),
          unit: ingredient.unit,
        })
        .returning({ id: recipeItems.id });

      await tx.insert(auditLogs).values({
        tenantId: membership.tenantId,
        actorType: "USER",
        actorId: membership.userId,
        action: "recipe.item_added",
        entityType: "recipe",
        entityId: recipe.id,
        after: { itemId: created?.id, ingredientId: ingredient.id, quantity },
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NOT_FOUND") return { error: "Ficha técnica não encontrada." };
    if (message === "INGREDIENT_NOT_FOUND") return { fieldErrors: { ingredientId: "Insumo não encontrado." } };
    if (message === "INGREDIENT_INACTIVE") return { fieldErrors: { ingredientId: "Insumo arquivado." } };
    const lower = message.toLowerCase();
    if (lower.includes("unique")) {
      return { fieldErrors: { ingredientId: "Este insumo já está na ficha. Edite a quantidade no item existente." } };
    }
    return { error: "Não foi possível adicionar o item. Tente novamente." };
  }

  revalidatePath(`/producao/receitas/${parsed.data.recipeId}`);
  revalidatePath("/producao");
  return { success: "Ingrediente adicionado à ficha." };
}

export async function removeRecipeItemAction(formData: FormData): Promise<void> {
  const recipeId = String(formData.get("recipeId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");

  const membership = await requireTenant([...WRITE_ROLES]);
  if (await productionWriteError(membership.tenantId)) return;

  await withTenant(membership.tenantId, async (tx) => {
    await tx
      .delete(recipeItems)
      .where(
        and(
          eq(recipeItems.tenantId, membership.tenantId),
          eq(recipeItems.recipeId, recipeId),
          eq(recipeItems.id, itemId),
        ),
      );

    await tx.insert(auditLogs).values({
      tenantId: membership.tenantId,
      actorType: "USER",
      actorId: membership.userId,
      action: "recipe.item_removed",
      entityType: "recipe",
      entityId: recipeId,
      before: { itemId },
    });
  });

  revalidatePath(`/producao/receitas/${recipeId}`);
  revalidatePath("/producao");
}

export async function archiveRecipeAction(formData: FormData): Promise<void> {
  const recipeId = String(formData.get("recipeId") ?? "");

  const membership = await requireTenant([...WRITE_ROLES]);
  if (await productionWriteError(membership.tenantId)) return;

  await withTenant(membership.tenantId, async (tx) => {
    await tx
      .update(recipes)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(recipes.tenantId, membership.tenantId), eq(recipes.id, recipeId)));

    await tx.insert(auditLogs).values({
      tenantId: membership.tenantId,
      actorType: "USER",
      actorId: membership.userId,
      action: "recipe.archived",
      entityType: "recipe",
      entityId: recipeId,
    });
  });

  revalidatePath("/producao");
  revalidatePath(`/producao/receitas/${recipeId}`);
}

const batchSchema = z.object({
  recipeId: z.string().min(1, "Escolha a ficha técnica."),
  plannedQuantity: z.string().trim().min(1, "Informe a quantidade planejada."),
  notes: z.string().trim().max(600).optional().or(z.literal("")),
});

export async function planBatchAction(
  _prev: ProductionState,
  formData: FormData,
): Promise<ProductionState> {
  const parsed = batchSchema.safeParse({
    recipeId: formData.get("recipeId"),
    plannedQuantity: formData.get("plannedQuantity"),
    notes: formData.get("notes") ?? "",
  });

  if (!parsed.success) {
    return { error: "Verifique os campos destacados.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const plannedQuantity = parseQuantity(parsed.data.plannedQuantity);
  if (plannedQuantity === null) {
    return { fieldErrors: { plannedQuantity: "Use uma quantidade maior que zero." } };
  }

  const membership = await requireTenant([...WRITE_ROLES]);
  const gateError = await productionWriteError(membership.tenantId);
  if (gateError) return { error: gateError };

  try {
    await withTenant(membership.tenantId, async (tx) => {
      const [recipe] = await tx
        .select({ id: recipes.id, isActive: recipes.isActive })
        .from(recipes)
        .where(
          and(
            eq(recipes.tenantId, membership.tenantId),
            eq(recipes.id, parsed.data.recipeId),
          ),
        )
        .limit(1);
      if (!recipe) throw new Error("NOT_FOUND");
      if (!recipe.isActive) throw new Error("INACTIVE");

      const [count] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(recipeItems)
        .where(
          and(
            eq(recipeItems.tenantId, membership.tenantId),
            eq(recipeItems.recipeId, recipe.id),
          ),
        );
      if ((count?.total ?? 0) === 0) throw new Error("EMPTY_RECIPE");

      const [created] = await tx
        .insert(productionBatches)
        .values({
          tenantId: membership.tenantId,
          recipeId: recipe.id,
          plannedQuantity: plannedQuantity.toFixed(3),
          notes: parsed.data.notes || null,
          createdBy: membership.userId,
        })
        .returning({ id: productionBatches.id });

      await tx.insert(auditLogs).values({
        tenantId: membership.tenantId,
        actorType: "USER",
        actorId: membership.userId,
        action: "production.planned",
        entityType: "production_batch",
        entityId: created?.id,
        after: { recipeId: recipe.id, plannedQuantity },
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NOT_FOUND") return { fieldErrors: { recipeId: "Ficha técnica não encontrada." } };
    if (message === "INACTIVE") return { fieldErrors: { recipeId: "Esta ficha está arquivada." } };
    if (message === "EMPTY_RECIPE") {
      return { error: "A ficha precisa ter ao menos um insumo antes de planejar a fornada." };
    }
    return { error: "Não foi possível planejar a fornada. Tente novamente." };
  }

  revalidatePath("/producao");
  return { success: "Fornada planejada." };
}

const completeSchema = z.object({
  batchId: z.string().min(1),
  producedQuantity: z.string().trim().min(1, "Informe a quantidade produzida."),
  lossQuantity: z.string().trim().optional().or(z.literal("")),
  lossReason: z.string().trim().max(300).optional().or(z.literal("")),
});

export async function completeBatchAction(
  _prev: ProductionState,
  formData: FormData,
): Promise<ProductionState> {
  const parsed = completeSchema.safeParse({
    batchId: formData.get("batchId"),
    producedQuantity: formData.get("producedQuantity"),
    lossQuantity: formData.get("lossQuantity") ?? "",
    lossReason: formData.get("lossReason") ?? "",
  });

  if (!parsed.success) {
    return { error: "Verifique os campos destacados.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const producedQuantity = parseQuantity(parsed.data.producedQuantity);
  if (producedQuantity === null) {
    return { fieldErrors: { producedQuantity: "Use uma quantidade maior que zero." } };
  }

  const lossQuantity = parsed.data.lossQuantity
    ? parseMinimumStock(parsed.data.lossQuantity)
    : 0;
  if (lossQuantity === null) {
    return { fieldErrors: { lossQuantity: "Use zero ou uma quantidade positiva." } };
  }

  const lossReason = parsed.data.lossReason || "";
  if (lossQuantity > 0 && lossReason.length === 0) {
    return { fieldErrors: { lossReason: "Explique a perda para manter o custo auditável." } };
  }

  const membership = await requireTenant([...WRITE_ROLES]);
  const gateError = await productionWriteError(membership.tenantId);
  if (gateError) return { error: gateError };

  try {
    await withTenant(membership.tenantId, async (tx) => {
      const [batch] = await tx
        .select({
          id: productionBatches.id,
          recipeId: productionBatches.recipeId,
          status: productionBatches.status,
          plannedQuantity: productionBatches.plannedQuantity,
          recipeYield: recipes.yieldQuantity,
          productId: recipes.productId,
          productName: products.name,
        })
        .from(productionBatches)
        .innerJoin(
          recipes,
          and(
            eq(recipes.tenantId, productionBatches.tenantId),
            eq(recipes.id, productionBatches.recipeId),
          ),
        )
        .innerJoin(
          products,
          and(eq(products.tenantId, recipes.tenantId), eq(products.id, recipes.productId)),
        )
        .where(
          and(
            eq(productionBatches.tenantId, membership.tenantId),
            eq(productionBatches.id, parsed.data.batchId),
          ),
        )
        .limit(1);

      if (!batch) throw new Error("NOT_FOUND");
      if (batch.status !== "PLANNED") throw new Error("NOT_PLANNED");

      const lines = await tx
        .select({
          ingredientId: ingredients.id,
          ingredientName: ingredients.name,
          quantity: recipeItems.quantity,
          unitCostCents: ingredients.costPerUnitCents,
        })
        .from(recipeItems)
        .innerJoin(
          ingredients,
          and(
            eq(ingredients.tenantId, recipeItems.tenantId),
            eq(ingredients.id, recipeItems.ingredientId),
          ),
        )
        .where(
          and(
            eq(recipeItems.tenantId, membership.tenantId),
            eq(recipeItems.recipeId, batch.recipeId),
          ),
        );

      if (lines.length === 0) throw new Error("EMPTY_RECIPE");

      const cost = computeProductionCost({
        yieldQuantity: Number(batch.recipeYield),
        producedQuantity,
        lossQuantity,
        items: lines.map((line) => ({
          quantity: Number(line.quantity),
          unitCostCents: line.unitCostCents,
        })),
      });

      for (const [index, line] of lines.entries()) {
        const consumption = cost.consumptions[index];
        if (!consumption) continue;

        try {
          await applyStockMovement(tx, {
            tenantId: membership.tenantId,
            itemType: "INGREDIENT",
            itemId: line.ingredientId,
            movementType: "PRODUCTION_CONSUMPTION",
            quantity: consumption.quantity,
            unitCostCents: consumption.unitCostCents,
            reason: "Consumo da fornada",
            referenceType: "production_batch",
            referenceId: batch.id,
            createdBy: membership.userId,
          });
        } catch (error) {
          if (error instanceof InsufficientStockError) {
            throw new Error(`INSUFFICIENT:${line.ingredientName}`);
          }
          throw error;
        }
      }

      const output = await applyStockMovement(tx, {
        tenantId: membership.tenantId,
        itemType: "PRODUCT",
        itemId: batch.productId,
        movementType: "PRODUCTION_OUTPUT",
        quantity: producedQuantity,
        unitCostCents: cost.unitCostCents,
        reason: "Entrada da fornada",
        referenceType: "production_batch",
        referenceId: batch.id,
        createdBy: membership.userId,
      });

      if (lossQuantity > 0) {
        await tx.insert(productionLosses).values({
          tenantId: membership.tenantId,
          batchId: batch.id,
          quantity: lossQuantity.toFixed(3),
          reason: lossReason,
          costCents: cost.lossCostCents,
          createdBy: membership.userId,
        });
      }

      await tx
        .update(productionBatches)
        .set({
          status: "DONE",
          producedQuantity: producedQuantity.toFixed(3),
          unitCostCents: cost.unitCostCents,
          startedAt: new Date(),
          finishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(productionBatches.tenantId, membership.tenantId),
            eq(productionBatches.id, batch.id),
          ),
        );

      await tx.insert(auditLogs).values({
        tenantId: membership.tenantId,
        actorType: "USER",
        actorId: membership.userId,
        action: "production.completed",
        entityType: "production_batch",
        entityId: batch.id,
        after: {
          producedQuantity,
          lossQuantity,
          factor: cost.factor,
          totalCostCents: cost.totalCostCents,
          unitCostCents: cost.unitCostCents,
          lossCostCents: cost.lossCostCents,
          productBalance: output.balance,
        },
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NOT_FOUND") return { error: "Fornada não encontrada neste estabelecimento." };
    if (message === "NOT_PLANNED") return { error: "Só uma fornada planejada pode ser concluída." };
    if (message === "EMPTY_RECIPE") return { error: "A ficha não tem insumos; não há o que consumir." };
    if (message.startsWith("INSUFFICIENT:")) {
      const ingredientName = message.slice("INSUFFICIENT:".length);
      return {
        error: `Estoque insuficiente de “${ingredientName}”. Registre a entrada antes de concluir a fornada.`,
      };
    }
    return { error: "Não foi possível concluir a fornada. Tente novamente." };
  }

  revalidatePath("/producao");
  revalidatePath(`/producao/lotes/${parsed.data.batchId}`);
  revalidatePath("/estoque");
  revalidatePath("/dashboard");
  return { success: "Fornada concluída: insumos consumidos e produto acabado em estoque." };
}

export async function cancelBatchAction(formData: FormData): Promise<void> {
  const batchId = String(formData.get("batchId") ?? "");

  const membership = await requireTenant([...WRITE_ROLES]);
  if (await productionWriteError(membership.tenantId)) return;

  await withTenant(membership.tenantId, async (tx) => {
    await tx
      .update(productionBatches)
      .set({ status: "CANCELLED", finishedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(productionBatches.tenantId, membership.tenantId),
          eq(productionBatches.id, batchId),
          eq(productionBatches.status, "PLANNED"),
        ),
      );

    await tx.insert(auditLogs).values({
      tenantId: membership.tenantId,
      actorType: "USER",
      actorId: membership.userId,
      action: "production.cancelled",
      entityType: "production_batch",
      entityId: batchId,
    });
  });

  revalidatePath("/producao");
  revalidatePath(`/producao/lotes/${batchId}`);
}
