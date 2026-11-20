"use server";

import { getDb, withTenant } from "@/lib/db";
import { tenants, user as userTable, subscriptions, payments, refundRequests, plans } from "@/db/schema";
import { eq, ilike, or, desc, sql } from "drizzle-orm";

export type AdminSearchResult = {
  type: "padaria" | "usuario" | "assinatura" | "pagamento" | "reembolso";
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

export async function adminGlobalSearch(query: string): Promise<AdminSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const like = `%${q}%`;
  const results: AdminSearchResult[] = [];

  // Padarias
  const tenantRows = await getDb()
    .select({ id: tenants.id, tradeName: tenants.tradeName, slug: tenants.slug, status: tenants.status })
    .from(tenants)
    .where(or(ilike(tenants.tradeName, like), ilike(tenants.slug, like)))
    .limit(8);

  for (const t of tenantRows) {
    results.push({
      type: "padaria",
      id: t.id,
      title: t.tradeName,
      subtitle: `Padaria · ${t.status}`,
      href: `/admin/clientes/${t.id}`,
    });
  }

  // Usuários
  const userRows = await getDb()
    .select({ id: userTable.id, name: userTable.name, email: userTable.email, status: userTable.status })
    .from(userTable)
    .where(or(ilike(userTable.name, like), ilike(userTable.email, like)))
    .limit(8);

  for (const u of userRows) {
    results.push({
      type: "usuario",
      id: u.id,
      title: u.name,
      subtitle: `${u.email} · ${u.status}`,
      href: `/admin/usuarios/${u.id}`,
    });
  }

  // Pagamentos (por id ou cliente)
  const paymentRows = await getDb()
    .select({ id: payments.id, tenantId: payments.tenantId, amountCents: payments.amountCents, status: payments.status, tradeName: tenants.tradeName })
    .from(payments)
    .innerJoin(tenants, eq(tenants.id, payments.tenantId))
    .where(or(ilike(payments.id, like), ilike(tenants.tradeName, like)))
    .orderBy(desc(payments.createdAt))
    .limit(8);

  for (const p of paymentRows) {
    results.push({
      type: "pagamento",
      id: p.id,
      title: `${p.tradeName} · ${p.status}`,
      subtitle: `Pagamento ${p.id.slice(0, 8)} · ${p.amountCents} centavos`,
      href: `/admin/financeiro`,
    });
  }

  // Assinaturas (por tenant)
  const subRows = await getDb()
    .select({ id: subscriptions.id, tenantId: subscriptions.tenantId, status: subscriptions.status, planName: plans.name, tradeName: tenants.tradeName })
    .from(subscriptions)
    .innerJoin(tenants, eq(tenants.id, subscriptions.tenantId))
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(or(ilike(tenants.tradeName, like), ilike(plans.name, like), ilike(subscriptions.id, like)))
    .orderBy(desc(subscriptions.createdAt))
    .limit(8);

  for (const s of subRows) {
    results.push({
      type: "assinatura",
      id: s.id,
      title: `${s.tradeName} · ${s.planName}`,
      subtitle: `Assinatura · ${s.status}`,
      href: `/admin/assinaturas`,
    });
  }

  // Reembolsos
  const refundRows = await getDb()
    .select({ id: refundRequests.id, tenantId: refundRequests.tenantId, status: refundRequests.status, amountCents: refundRequests.amountCents, tradeName: tenants.tradeName })
    .from(refundRequests)
    .innerJoin(tenants, eq(tenants.id, refundRequests.tenantId))
    .where(or(ilike(refundRequests.id, like), ilike(tenants.tradeName, like), ilike(refundRequests.status, like)))
    .orderBy(desc(refundRequests.requestedAt))
    .limit(8);

  for (const r of refundRows) {
    results.push({
      type: "reembolso",
      id: r.id,
      title: `${r.tradeName} · ${r.status}`,
      subtitle: `Reembolso ${r.id.slice(0, 8)} · ${r.amountCents} centavos`,
      href: `/admin/assinaturas`,
    });
  }

  return results.slice(0, 40);
}
