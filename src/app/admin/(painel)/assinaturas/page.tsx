import Link from "next/link";
import { listPlatformSubscriptions } from "@/modules/platform/queries";
import { formatBRL } from "@/modules/shared/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "Assinaturas" };

export default async function PlatformSubscriptionsPage() {
  const rows = await listPlatformSubscriptions();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">MASTER CONTROL</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink">Assinaturas</h1>
        <p className="mt-1 text-sm text-ink-muted">{rows.length} assinatura(s).</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-white">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-ink-muted">
            <tr>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Plano</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Mensalidade</th>
              <th className="px-4 py-3">Próximo venc.</th>
              <th className="px-4 py-3">Criada em</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
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
                <td className="px-4 py-3 text-xs">
                  {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(row.subscription.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
