import { and, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { getDb, withTenant, type Database } from "@/lib/db";
import {
  auditLogs,
  backupRuns,
  coupons,
  featureDefinitions,
  invoices,
  planFeatures,
  plans,
  platformIncidents,
  securityEvents,
  subscriptions,
  systemHealthChecks,
  tenantDiscounts,
  tenants,
  webhookEvents,
} from "@/db/schema";

export type PlatformPlan = {
  id: string;
  code: string;
  name: string;
  priceCents: number;
  activationFeeCents: number;
  isActive: boolean;
  isFeatured: boolean;
  sortOrder: number;
};

export type PlatformClient = {
  tenantId: string;
  tradeName: string;
  slug: string;
  tenantStatus: string;
  tenantCreatedAt: Date;
  subscriptionId: string | null;
  subscriptionStatus: string | null;
  planId: string | null;
  planName: string | null;
  priceCents: number;
  nextDueDate: string | null;
  openInvoices: number;
  overdueCents: number;
  overdueInvoices: number;
};

export type PlatformOverview = {
  totalTenants: number;
  activeClients: number;
  delinquentClients: number;
  newTenantsThisMonth: number;
  churnLast30Days: number;
  mrrCents: number;
  revenueThisMonthCents: number;
  overdueCents: number;
  byPlan: Array<{ planId: string; name: string; clients: number; mrrCents: number }>;
  clients: PlatformClient[];
};

function monthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function asNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : Number(value);
}

export async function listPlatformPlans(): Promise<PlatformPlan[]> {
  const rows = await getDb()
    .select({
      id: plans.id,
      code: plans.code,
      name: plans.name,
      priceCents: plans.priceCents,
      activationFeeCents: plans.activationFeeCents,
      isActive: plans.isActive,
      isFeatured: plans.isFeatured,
      sortOrder: plans.sortOrder,
    })
    .from(plans)
    .orderBy(plans.sortOrder, plans.name);

  return rows;
}

export async function getPlatformOverview(): Promise<PlatformOverview> {
  const tenantRows = await getDb()
    .select({
      id: tenants.id,
      tradeName: tenants.tradeName,
      slug: tenants.slug,
      status: tenants.status,
      createdAt: tenants.createdAt,
    })
    .from(tenants)
    .orderBy(desc(tenants.createdAt));

  const planRows = await listPlatformPlans();
  const planMap = new Map(planRows.map((plan) => [plan.id, plan]));
  const start = monthStart();
  const churnCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const clients: PlatformClient[] = [];
  let mrrCents = 0;
  let revenueThisMonthCents = 0;
  let overdueCents = 0;
  let activeClients = 0;
  let delinquentClients = 0;
  let newTenantsThisMonth = 0;
  let churnLast30Days = 0;

  for (const tenant of tenantRows) {
    if (tenant.createdAt >= start) newTenantsThisMonth += 1;

    const data = await withTenant(tenant.id, async (tx) => {
      const [sub] = await tx
        .select({
          id: subscriptions.id,
          status: subscriptions.status,
          planId: subscriptions.planId,
          priceCents: subscriptions.priceCents,
          nextDueDate: subscriptions.nextDueDate,
        })
        .from(subscriptions)
        .where(and(eq(subscriptions.tenantId, tenant.id), ne(subscriptions.status, "CANCELLED")))
        .limit(1);

      const open = await tx
        .select({
          count: sql<number>`count(*)::int`,
          total: sql<string>`coalesce(sum(${invoices.totalCents}), 0)`,
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.tenantId, tenant.id),
            inArray(invoices.status, ["OPEN", "OVERDUE"]),
          ),
        );

      const overdue = await tx
        .select({
          count: sql<number>`count(*)::int`,
          total: sql<string>`coalesce(sum(${invoices.totalCents}), 0)`,
        })
        .from(invoices)
        .where(
          and(eq(invoices.tenantId, tenant.id), eq(invoices.status, "OVERDUE")),
        );

      const [revenue] = await tx
        .select({ total: sql<string>`coalesce(sum(${invoices.totalCents}), 0)` })
        .from(invoices)
        .where(
          and(
            eq(invoices.tenantId, tenant.id),
            eq(invoices.status, "PAID"),
            gte(invoices.paidAt, start),
          ),
        );

      const [churn] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.tenantId, tenant.id),
            eq(subscriptions.status, "CANCELLED"),
            gte(subscriptions.cancelledAt, churnCutoff),
          ),
        );

      return { sub, open: open[0], overdue: overdue[0], revenue, churn };
    });

    const plan = data.sub ? planMap.get(data.sub.planId) : undefined;
    const openCount = data.open?.count ?? 0;
    const overdueCount = data.overdue?.count ?? 0;
    const overdueAmount = asNumber(data.overdue?.total);
    const revenue = asNumber(data.revenue?.total);
    const subStatus = data.sub?.status ?? null;

    revenueThisMonthCents += revenue;
    overdueCents += overdueAmount;
    churnLast30Days += data.churn?.count ?? 0;

    // MRR é a soma das assinaturas ACTIVE (contrato), mesmo que o tenant esteja
    // suspenso administrativamente. "Clientes ativos" exige os dois ativos.
    if (subStatus === "ACTIVE") {
      mrrCents += data.sub?.priceCents ?? 0;
    }
    if (subStatus === "ACTIVE" && tenant.status === "ACTIVE") {
      activeClients += 1;
    }

    if (
      tenant.status === "SUSPENDED" ||
      subStatus === "PAST_DUE" ||
      subStatus === "RESTRICTED" ||
      subStatus === "SUSPENDED"
    ) {
      delinquentClients += 1;
    }

    clients.push({
      tenantId: tenant.id,
      tradeName: tenant.tradeName,
      slug: tenant.slug,
      tenantStatus: tenant.status,
      tenantCreatedAt: tenant.createdAt,
      subscriptionId: data.sub?.id ?? null,
      subscriptionStatus: subStatus,
      planId: data.sub?.planId ?? null,
      planName: plan?.name ?? null,
      priceCents: data.sub?.priceCents ?? 0,
      nextDueDate: data.sub?.nextDueDate ?? null,
      openInvoices: openCount,
      overdueCents: overdueAmount,
      overdueInvoices: overdueCount,
    });
  }

  const byPlan = planRows.map((plan) => {
    const planClients = clients.filter(
      (client) => client.planId === plan.id && client.subscriptionStatus === "ACTIVE",
    );
    return {
      planId: plan.id,
      name: plan.name,
      clients: planClients.length,
      mrrCents: planClients.reduce((sum, client) => sum + client.priceCents, 0),
    };
  });

  return {
    totalTenants: tenantRows.length,
    activeClients,
    delinquentClients,
    newTenantsThisMonth,
    churnLast30Days,
    mrrCents,
    revenueThisMonthCents,
    overdueCents,
    byPlan,
    clients,
  };
}

export async function getPlatformClientDetail(tenantId: string) {
  const [tenant] = await getDb()
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!tenant) return null;

  const data = await withTenant(tenantId, async (tx) => {
    const subs = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, tenantId))
      .orderBy(desc(subscriptions.createdAt));

    const invoiceRows = await tx
      .select()
      .from(invoices)
      .where(eq(invoices.tenantId, tenantId))
      .orderBy(desc(invoices.createdAt))
      .limit(12);

    return { subs, invoices: invoiceRows };
  });

  const planRows = await getDb().select().from(plans).orderBy(plans.sortOrder);
  const current = data.subs.find((sub) => sub.status !== "CANCELLED") ?? data.subs[0] ?? null;

  return {
    tenant,
    subscriptions: data.subs,
    current,
    invoices: data.invoices,
    plans: planRows,
  };
}

export async function listAuditLogs(
  tx: Database,
  input?: { limit?: number; tenantId?: string },
) {
  const limit = Math.min(input?.limit ?? 100, 300);
  const where = input?.tenantId ? eq(auditLogs.tenantId, input.tenantId) : undefined;

  return tx
    .select()
    .from(auditLogs)
    .where(where)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}

export async function getPlanEditor() {
  const [planRows, featureRows, links] = await Promise.all([
    getDb().select().from(plans).orderBy(plans.sortOrder, plans.name),
    getDb()
      .select()
      .from(featureDefinitions)
      .where(eq(featureDefinitions.isActive, true))
      .orderBy(featureDefinitions.name),
    getDb().select().from(planFeatures),
  ]);

  return { plans: planRows, features: featureRows, links };
}

export async function listTenantOptions() {
  return getDb()
    .select({ id: tenants.id, tradeName: tenants.tradeName, status: tenants.status })
    .from(tenants)
    .orderBy(tenants.tradeName);
}

export async function listCoupons() {
  const rows = await getDb()
    .select({
      coupon: coupons,
      planName: plans.name,
    })
    .from(coupons)
    .leftJoin(plans, eq(plans.id, coupons.appliesToPlanId))
    .orderBy(desc(coupons.createdAt))
    .limit(100);

  return rows;
}

export async function listNegotiatedDiscounts() {
  const tenantRows = await listTenantOptions();
  const rows: Array<{
    tenantId: string;
    tradeName: string;
    id: string;
    discountType: string;
    value: number;
    validFrom: string;
    validTo: string | null;
    reason: string;
    createdAt: Date;
  }> = [];

  for (const tenant of tenantRows) {
    const discounts = await withTenant(tenant.id, (tx) =>
      tx
        .select()
        .from(tenantDiscounts)
        .where(eq(tenantDiscounts.tenantId, tenant.id))
        .orderBy(desc(tenantDiscounts.validFrom))
        .limit(20),
    );

    for (const discount of discounts) {
      rows.push({
        tenantId: tenant.id,
        tradeName: tenant.tradeName,
        id: discount.id,
        discountType: discount.discountType,
        value: discount.value,
        validFrom: discount.validFrom,
        validTo: discount.validTo,
        reason: discount.reason,
        createdAt: discount.createdAt,
      });
    }
  }

  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 100);
}

export async function getSystemSnapshot() {
  const [backups, health, incidents, webhookFailures, security] = await Promise.all([
    getDb().select().from(backupRuns).orderBy(desc(backupRuns.startedAt)).limit(8),
    getDb()
      .select()
      .from(systemHealthChecks)
      .orderBy(desc(systemHealthChecks.checkedAt))
      .limit(30),
    getDb()
      .select()
      .from(platformIncidents)
      .orderBy(desc(platformIncidents.startedAt))
      .limit(10),
    getDb()
      .select()
      .from(webhookEvents)
      .where(inArray(webhookEvents.status, ["FAILED", "RECEIVED"]))
      .orderBy(desc(webhookEvents.receivedAt))
      .limit(10),
    getDb()
      .select()
      .from(securityEvents)
      .orderBy(desc(securityEvents.createdAt))
      .limit(10),
  ]);

  return { backups, health, incidents, webhookFailures, security };
}
