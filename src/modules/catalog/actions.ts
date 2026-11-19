"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTenant } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { auditLogs, categories, productPriceHistory, products } from "@/db/schema";
import { loadEntitlements } from "@/modules/billing/queries";
import { isWithinLimit } from "@/modules/plans/entitlements";
import { countProducts, getProduct } from "./queries";
import { isProductUnit, nextSortOrder, parsePriceToCents } from "./rules";
import { uniqueSlug } from "./slug";

/**
 * Escrita de catálogo.
 *
 * Ordem das verificações (todas no servidor, nenhuma confiando no formulário):
 *  1. sessão + vínculo + perfil;
 *  2. estado financeiro permite escrita;
 *  3. limite do plano;
 *  4. validação dos dados;
 *  5. transação com RLS + auditoria.
 */

const WRITE_ROLES = ["OWNER", "MANAGER"] as const;

export type CatalogState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
};

const productSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Informe o nome do produto").max(120),
  description: z.string().trim().max(600).optional().or(z.literal("")),
  price: z.string().trim().min(1, "Informe o preço"),
  unit: z.string().trim(),
  categoryId: z.string().optional().or(z.literal("")),
  isAvailable: z.boolean(),
});

function fieldErrorsFrom(issues: z.ZodIssue[]): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !fieldErrors[field]) fieldErrors[field] = issue.message;
  }
  return fieldErrors;
}

export async function saveProductAction(
  _prev: CatalogState,
  formData: FormData,
): Promise<CatalogState> {
  const membership = await requireTenant([...WRITE_ROLES]);

  const parsed = productSchema.safeParse({
    id: formData.get("id") || undefined,
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    price: formData.get("price"),
    unit: formData.get("unit"),
    categoryId: formData.get("categoryId") ?? "",
    isAvailable: formData.get("isAvailable") === "on",
  });

  if (!parsed.success) {
    return { error: "Verifique os campos destacados.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const data = parsed.data;

  if (!isProductUnit(data.unit)) {
    return { fieldErrors: { unit: "Unidade inválida." } };
  }

  const priceCents = parsePriceToCents(data.price);
  if (priceCents === null) {
    return { fieldErrors: { price: "Use um valor como 12,50." } };
  }
  if (priceCents <= 0) {
    return { fieldErrors: { price: "O preço precisa ser maior que zero." } };
  }

  const loaded = await loadEntitlements(membership.tenantId);
  if (!loaded) {
    return { error: "Nenhuma assinatura ativa encontrada. Fale com o suporte." };
  }
  if (!loaded.entitlements.access.canWriteOperational) {
    return {
      error:
        loaded.entitlements.warning ??
        "A edição do catálogo está suspensa por pendência financeira.",
    };
  }

  const isCreate = !data.id;
  if (isCreate) {
    const total = await countProducts(membership.tenantId);
    if (!isWithinLimit(loaded.entitlements, "products.max", total)) {
      const limit = loaded.entitlements.limits["products.max"];
      return {
        error: `Seu plano permite ${limit} produtos. Desative itens antigos ou faça upgrade para cadastrar mais.`,
      };
    }
  }

  const categoryId = data.categoryId || null;

  if (categoryId) {
    const [category] = await withTenant(membership.tenantId, (tx) =>
      tx
        .select({ id: categories.id })
        .from(categories)
        .where(
          and(eq(categories.tenantId, membership.tenantId), eq(categories.id, categoryId)),
        )
        .limit(1),
    );
    if (!category) {
      return { fieldErrors: { categoryId: "Categoria não encontrada." } };
    }
  }

  try {
    await withTenant(membership.tenantId, async (tx) => {
      if (isCreate) {
        // Uma única leitura para slug e ordem: nada de abrir transação aninhada.
        const rows = await tx
          .select({ slug: products.slug, sortOrder: products.sortOrder })
          .from(products)
          .where(eq(products.tenantId, membership.tenantId));

        const [created] = await tx
          .insert(products)
          .values({
            tenantId: membership.tenantId,
            name: data.name,
            slug: uniqueSlug(data.name, rows.map((row) => row.slug)),
            description: data.description || null,
            priceCents,
            unit: data.unit,
            categoryId,
            isAvailable: data.isAvailable,
            sortOrder: nextSortOrder(rows.map((row) => row.sortOrder)),
          })
          .returning({ id: products.id });

        await tx.insert(auditLogs).values({
          tenantId: membership.tenantId,
          actorType: "USER",
          actorId: membership.userId,
          action: "product.created",
          entityType: "product",
          entityId: created?.id,
          after: { name: data.name, priceCents, isAvailable: data.isAvailable },
        });

        return;
      }

      const [current] = await tx
        .select()
        .from(products)
        .where(
          and(
            eq(products.tenantId, membership.tenantId),
            eq(products.id, data.id as string),
            isNull(products.deletedAt),
          ),
        )
        .limit(1);
      if (!current) throw new Error("NOT_FOUND");

      await tx
        .update(products)
        .set({
          name: data.name,
          description: data.description || null,
          priceCents,
          unit: data.unit,
          categoryId,
          isAvailable: data.isAvailable,
          updatedAt: new Date(),
        })
        .where(and(eq(products.tenantId, membership.tenantId), eq(products.id, current.id)));

      // Preço só entra no histórico quando muda de fato.
      if (current.priceCents !== priceCents) {
        await tx.insert(productPriceHistory).values({
          tenantId: membership.tenantId,
          productId: current.id,
          oldPriceCents: current.priceCents,
          newPriceCents: priceCents,
          changedBy: membership.userId,
        });
      }

      await tx.insert(auditLogs).values({
        tenantId: membership.tenantId,
        actorType: "USER",
        actorId: membership.userId,
        action: "product.updated",
        entityType: "product",
        entityId: current.id,
        before: {
          name: current.name,
          priceCents: current.priceCents,
          isAvailable: current.isAvailable,
        },
        after: { name: data.name, priceCents, isAvailable: data.isAvailable },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return { error: "Produto não encontrado neste estabelecimento." };
    }
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("unique") || message.includes("slug")) {
      return { fieldErrors: { name: "Já existe um produto com este endereço." } };
    }
    return { error: "Não foi possível salvar o produto. Tente novamente." };
  }

  revalidatePath("/catalogo");
  revalidatePath("/dashboard");
  return { success: isCreate ? "Produto cadastrado." : "Produto atualizado." };
}

export async function toggleAvailabilityAction(formData: FormData): Promise<void> {
  const membership = await requireTenant([...WRITE_ROLES]);
  const productId = String(formData.get("productId") ?? "");

  const loaded = await loadEntitlements(membership.tenantId);
  if (!loaded?.entitlements.access.canWriteOperational) return;

  const current = await getProduct(membership.tenantId, productId);
  if (!current) return;

  await withTenant(membership.tenantId, async (tx) => {
    await tx
      .update(products)
      .set({ isAvailable: !current.isAvailable, updatedAt: new Date() })
      .where(and(eq(products.tenantId, membership.tenantId), eq(products.id, productId)));

    await tx.insert(auditLogs).values({
      tenantId: membership.tenantId,
      actorType: "USER",
      actorId: membership.userId,
      action: current.isAvailable ? "product.unpublished" : "product.published",
      entityType: "product",
      entityId: productId,
      after: { isAvailable: !current.isAvailable },
    });
  });

  revalidatePath("/catalogo");
  revalidatePath(`/catalogo/${productId}`);
}

export async function archiveProductAction(formData: FormData): Promise<void> {
  const membership = await requireTenant([...WRITE_ROLES]);
  const productId = String(formData.get("productId") ?? "");

  const loaded = await loadEntitlements(membership.tenantId);
  if (!loaded?.entitlements.access.canWriteOperational) return;

  await withTenant(membership.tenantId, async (tx) => {
    // Soft delete: o produto sai da vitrine mas o histórico permanece.
    await tx
      .update(products)
      .set({
        deletedAt: new Date(),
        isActive: false,
        isAvailable: false,
        updatedAt: new Date(),
      })
      .where(and(eq(products.tenantId, membership.tenantId), eq(products.id, productId)));

    await tx.insert(auditLogs).values({
      tenantId: membership.tenantId,
      actorType: "USER",
      actorId: membership.userId,
      action: "product.archived",
      entityType: "product",
      entityId: productId,
    });
  });

  revalidatePath("/catalogo");
}

const categorySchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da categoria").max(60),
});

export async function saveCategoryAction(
  _prev: CatalogState,
  formData: FormData,
): Promise<CatalogState> {
  const membership = await requireTenant([...WRITE_ROLES]);

  const parsed = categorySchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: "Verifique o nome da categoria.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const loaded = await loadEntitlements(membership.tenantId);
  if (!loaded?.entitlements.access.canWriteOperational) {
    return { error: loaded?.entitlements.warning ?? "Edição suspensa por pendência financeira." };
  }

  try {
    await withTenant(membership.tenantId, async (tx) => {
      const rows = await tx
        .select({ slug: categories.slug, sortOrder: categories.sortOrder })
        .from(categories)
        .where(eq(categories.tenantId, membership.tenantId));

      const [created] = await tx
        .insert(categories)
        .values({
          tenantId: membership.tenantId,
          name: parsed.data.name,
          slug: uniqueSlug(parsed.data.name, rows.map((row) => row.slug)),
          sortOrder: nextSortOrder(rows.map((row) => row.sortOrder)),
        })
        .returning({ id: categories.id });

      await tx.insert(auditLogs).values({
        tenantId: membership.tenantId,
        actorType: "USER",
        actorId: membership.userId,
        action: "category.created",
        entityType: "category",
        entityId: created?.id,
        after: { name: parsed.data.name },
      });
    });
  } catch {
    return { error: "Não foi possível criar a categoria." };
  }

  revalidatePath("/catalogo");
  return { success: "Categoria criada." };
}

export async function archiveCategoryAction(formData: FormData): Promise<void> {
  const membership = await requireTenant([...WRITE_ROLES]);
  const categoryId = String(formData.get("categoryId") ?? "");

  const loaded = await loadEntitlements(membership.tenantId);
  if (!loaded?.entitlements.access.canWriteOperational) return;

  await withTenant(membership.tenantId, async (tx) => {
    // Categoria desativada some da vitrine, mas os produtos continuam no catálogo.
    await tx
      .update(categories)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(categories.tenantId, membership.tenantId), eq(categories.id, categoryId)));

    await tx.insert(auditLogs).values({
      tenantId: membership.tenantId,
      actorType: "USER",
      actorId: membership.userId,
      action: "category.archived",
      entityType: "category",
      entityId: categoryId,
    });
  });

  revalidatePath("/catalogo");
}
