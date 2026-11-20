import Link from "next/link";
import { listPlatformSubscriptions } from "@/modules/platform/queries";
import { listRefundRequests } from "@/modules/billing/refunds";
import { formatBRL } from "@/modules/shared/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "Assinaturas" };

export default async function PlatformSubscriptionsPage() {
  const [rows, refunds] = await Promise.all([listPlatformSubscriptions(), listRefundRequests()]);

  const total = rows.length;
  const active = rows.filter((r) => r.subscription.status === "ACTIVE").length;
  const overdue = rows.filter((r) => r.subscription.status === "PAST_DUE").length;
  const suspended = rows.filter((r) => r.subscription.status === "SUSPENDED").length;
  const cancelled = rows.filter((r) => r.subscription.status === "CANCELLED").length;
  const refundRequested = refunds.filter((r) => r.status === "REQUESTED" || r.status === "IN_ANALYSIS").length;
  const refundApproved = refunds.filter((r) => r.status === "APPROVED" || r.status === "PROCESSED").length;
  const refundedTotal = refunds.filter((r) => r.status === "PROCESSED").reduce((s, r) => s + r.amountCents, 0);

  const indicators = [
    { label: "Total", value: total },
    { label: "Ativas", value: active },
    { label: "Vencidas", value: overdue },
    { label: "Bloqueadas", value: suspended },
    { label: "Canceladas", value: cancelled },
    { label: "Reembolsos solicitados", value: refundRequested },
    { label: "Reembolsos aprovados", value: refundApproved },
    { label: "Total reembolsado", value: formatBRL(refundedTotal) },
  ];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">MASTER CONTROL</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink">Assinaturas</h1>
        <p className="mt-1 text-sm text-ink-muted">{rows.length} assinatura(s).</p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {indicators.map((item) => (
          <div key={item.label} className="rounded-xl border border-border bg-surface p-4">
            <p className="text-xs uppercase tracking-wide text-ink-muted">{item.label}</p>
            <p className="mt-1 text-lg font-semibold">{item.value}</p>
          </div>
        ))}
      </section>

      <div className="overflow-x-auto rounded-xl border border-border bg-white">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-ink-muted">
            <tr>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Plano</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Mensalidade</th>
              <th className="px-4 py-3">Próximo venc.</th>
              <th className="px-4 py-3">Reembolso</th>
              <th className="px-4 py-3">Criada em</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const refund = refunds.find((r) => r.subscriptionId === row.subscription.id);
              return (
              <tr key={row.subscription.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/admin/clientes/${row.tenant.id}`} className="font-medium hover:text-brand-700">
                    {row.tenant.tradeName}
                  </Link>
                </td>
                <td className="px-4 py-3">{row.plan.name}</td>
                <td className="px-4 py-3">{row.subscription.status}</td>
                <td className="px-4 py-3 text-right">{formatBRL(row.subscription.priceCents)}</td>
                <td className="px-4 py-3">{row.subscription.nextDueDate ?? "—"}</td>
                <td className="px-4 py-3 text-xs">{refund ? refund.status : "—"}</td>
                <td className="px-4 py-3 text-xs">
                  {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(row.subscription.createdAt)}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
