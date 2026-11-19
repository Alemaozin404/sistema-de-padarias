import { asc, eq } from "drizzle-orm";
import { getDb, withTenant } from "@/lib/db";
import {
  auditLogs,
  categories,
  ingredients,
  invoices,
  memberships,
  notificationLog,
  payments,
  productImages,
  productPriceHistory,
  products,
  productionBatches,
  productionLosses,
  recipes,
  recipeItems,
  stockBalances,
  stockMovements,
  subscriptions,
  subscriptionStatusHistory,
  tenantDiscounts,
  tenants,
  user,
} from "@/db/schema";

export type LgpdExport = {
  formatVersion: 1;
  generatedAt: string;
  tenant: Record<string, unknown>;
  memberships: Record<string, unknown>[];
  catalog: {
    categories: Record<string, unknown>[];
    products: Record<string, unknown>[];
    productImages: Record<string, unknown>[];
    priceHistory: Record<string, unknown>[];
  };
  inventory: {
    ingredients: Record<string, unknown>[];
    balances: Record<string, unknown>[];
    movements: Record<string, unknown>[];
  };
  production: {
    recipes: Record<string, unknown>[];
    recipeItems: Record<string, unknown>[];
    batches: Record<string, unknown>[];
    losses: Record<string, unknown>[];
  };
  billing: {
    subscription: Record<string, unknown> | null;
    statusHistory: Record<string, unknown>[];
    invoices: Record<string, unknown>[];
    payments: Record<string, unknown>[];
    discounts: Record<string, unknown>[];
    notifications: Record<string, unknown>[];
  };
  auditLogs: Record<string, unknown>[];
};

export async function collectTenantData(tenantId: string): Promise<LgpdExport> {
  return withTenant(tenantId, async (tx) => {
    const [tenant] = await tx
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!tenant) throw new Error("Estabelecimento não encontrado.");

    const membershipRows = await tx
      .select({
        membershipId: memberships.id,
        tenantId: memberships.tenantId,
        role: memberships.role,
        status: memberships.status,
        invitedBy: memberships.invitedBy,
        acceptedAt: memberships.acceptedAt,
        createdAt: memberships.createdAt,
        updatedAt: memberships.updatedAt,
        userId: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
      })
      .from(memberships)
      .innerJoin(user, eq(user.id, memberships.userId))
      .where(eq(memberships.tenantId, tenantId))
      .orderBy(asc(memberships.createdAt));

    const categoryRows = await tx
      .select()
      .from(categories)
      .where(eq(categories.tenantId, tenantId))
      .orderBy(asc(categories.sortOrder), asc(categories.name));

    const productRows = await tx
      .select()
      .from(products)
      .where(eq(products.tenantId, tenantId))
      .orderBy(asc(products.name));

    const imageRows = await tx
      .select()
      .from(productImages)
      .where(eq(productImages.tenantId, tenantId))
      .orderBy(asc(productImages.sortOrder));

    const priceHistoryRows = await tx
      .select()
      .from(productPriceHistory)
      .where(eq(productPriceHistory.tenantId, tenantId))
      .orderBy(asc(productPriceHistory.createdAt));

    const ingredientRows = await tx
      .select()
      .from(ingredients)
      .where(eq(ingredients.tenantId, tenantId))
      .orderBy(asc(ingredients.name));

    const balanceRows = await tx
      .select()
      .from(stockBalances)
      .where(eq(stockBalances.tenantId, tenantId));

    const movementRows = await tx
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.tenantId, tenantId))
      .orderBy(asc(stockMovements.createdAt));

    const recipeRows = await tx
      .select()
      .from(recipes)
      .where(eq(recipes.tenantId, tenantId))
      .orderBy(asc(recipes.name));

    const recipeItemRows = await tx
      .select()
      .from(recipeItems)
      .where(eq(recipeItems.tenantId, tenantId));

    const batchRows = await tx
      .select()
      .from(productionBatches)
      .where(eq(productionBatches.tenantId, tenantId))
      .orderBy(asc(productionBatches.plannedAt));

    const lossRows = await tx
      .select()
      .from(productionLosses)
      .where(eq(productionLosses.tenantId, tenantId))
      .orderBy(asc(productionLosses.createdAt));

    const [subscription] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, tenantId))
      .limit(1);

    const statusHistoryRows = await tx
      .select()
      .from(subscriptionStatusHistory)
      .where(eq(subscriptionStatusHistory.tenantId, tenantId))
      .orderBy(asc(subscriptionStatusHistory.createdAt));

    const invoiceRows = await tx
      .select()
      .from(invoices)
      .where(eq(invoices.tenantId, tenantId))
      .orderBy(asc(invoices.createdAt));

    const paymentRows = await tx
      .select()
      .from(payments)
      .where(eq(payments.tenantId, tenantId))
      .orderBy(asc(payments.createdAt));

    const discountRows = await tx
      .select()
      .from(tenantDiscounts)
      .where(eq(tenantDiscounts.tenantId, tenantId))
      .orderBy(asc(tenantDiscounts.validFrom));

    const notificationRows = await tx
      .select()
      .from(notificationLog)
      .where(eq(notificationLog.tenantId, tenantId))
      .orderBy(asc(notificationLog.createdAt));

    const auditRows = await tx
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.tenantId, tenantId))
      .orderBy(asc(auditLogs.createdAt));

    return {
      formatVersion: 1,
      generatedAt: new Date().toISOString(),
      tenant: tenant as unknown as Record<string, unknown>,
      memberships: membershipRows as unknown as Record<string, unknown>[],
      catalog: {
        categories: categoryRows as unknown as Record<string, unknown>[],
        products: productRows as unknown as Record<string, unknown>[],
        productImages: imageRows as unknown as Record<string, unknown>[],
        priceHistory: priceHistoryRows as unknown as Record<string, unknown>[],
      },
      inventory: {
        ingredients: ingredientRows as unknown as Record<string, unknown>[],
        balances: balanceRows as unknown as Record<string, unknown>[],
        movements: movementRows as unknown as Record<string, unknown>[],
      },
      production: {
        recipes: recipeRows as unknown as Record<string, unknown>[],
        recipeItems: recipeItemRows as unknown as Record<string, unknown>[],
        batches: batchRows as unknown as Record<string, unknown>[],
        losses: lossRows as unknown as Record<string, unknown>[],
      },
      billing: {
        subscription: (subscription ?? null) as Record<string, unknown> | null,
        statusHistory: statusHistoryRows as unknown as Record<string, unknown>[],
        invoices: invoiceRows as unknown as Record<string, unknown>[],
        payments: paymentRows as unknown as Record<string, unknown>[],
        discounts: discountRows as unknown as Record<string, unknown>[],
        notifications: notificationRows as unknown as Record<string, unknown>[],
      },
      auditLogs: auditRows as unknown as Record<string, unknown>[],
    };
  });
}

export function flattenExport(data: LgpdExport): Array<{
  resource: string;
  id: string;
  data: Record<string, unknown>;
}> {
  const rows: Array<{ resource: string; id: string; data: Record<string, unknown> }> = [];

  const pushObject = (resource: string, value: Record<string, unknown> | null) => {
    if (value) rows.push({ resource, id: String(value.id ?? value.tenantId ?? "singleton"), data: value });
  };

  const pushArray = (resource: string, values: Record<string, unknown>[]) => {
    for (const value of values) {
      rows.push({ resource, id: String(value.id ?? value.membershipId ?? "row"), data: value });
    }
  };

  pushObject("tenant", data.tenant);
  pushArray("memberships", data.memberships);
  pushArray("catalog.categories", data.catalog.categories);
  pushArray("catalog.products", data.catalog.products);
  pushArray("catalog.productImages", data.catalog.productImages);
  pushArray("catalog.priceHistory", data.catalog.priceHistory);
  pushArray("inventory.ingredients", data.inventory.ingredients);
  pushArray("inventory.balances", data.inventory.balances);
  pushArray("inventory.movements", data.inventory.movements);
  pushArray("production.recipes", data.production.recipes);
  pushArray("production.recipeItems", data.production.recipeItems);
  pushArray("production.batches", data.production.batches);
  pushArray("production.losses", data.production.losses);
  pushObject("billing.subscription", data.billing.subscription);
  pushArray("billing.statusHistory", data.billing.statusHistory);
  pushArray("billing.invoices", data.billing.invoices);
  pushArray("billing.payments", data.billing.payments);
  pushArray("billing.discounts", data.billing.discounts);
  pushArray("billing.notifications", data.billing.notifications);
  pushArray("auditLogs", data.auditLogs);

  return rows;
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function toCsv(data: LgpdExport): string {
  const lines = ["\uFEFFrecurso,id,dados"];
  for (const row of flattenExport(data)) {
    lines.push(
      [csvEscape(row.resource), csvEscape(row.id), csvEscape(JSON.stringify(row.data))].join(","),
    );
  }
  return lines.join("\r\n");
}

export function exportFilename(slug: string, format: "json" | "csv"): string {
  const safeSlug = slug.replace(/[^a-z0-9-]/gi, "-") || "estabelecimento";
  const date = new Date().toISOString().slice(0, 10);
  return `dados-${safeSlug}-${date}.${format}`;
}
