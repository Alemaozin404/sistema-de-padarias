import Link from "next/link";
import { getPlatformOverview } from "@/modules/platform/queries";
import { formatBRL } from "@/modules/shared/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inadimplência" };

export default async function PlatformDelinquencyPage() {
  const overview = await getPlatformOverview();
  const delinquent = overview.clients.filter((client) => client.overdueCents > 0 || client.tenantStatus === "SUSPENDED");

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">MASTER CONTROL</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink">Inadimplência</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {delinquent.length} cliente(s) com pendência. Total vencido: {formatBRL(overview.overdueCents)}.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-ink-muted">
            <tr>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Plano</th>
              <th className="px-4 py-3">Status tenant</th>
              <th className="px-4 py-3">Assinatura</th>
              <th className="px-4 py-3 text-right">Vencido</th>
              <th className="px-4 py-3 text-right">Faturas abertas</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {delinquent.map((client) => (
              <tr key={client.tenantId} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/admin/clientes/${client.tenantId}`} className="font-medium hover:text-brand-700">
                    {client.tradeName}
                  </Link>
                </td>
                <td className="px-4 py-3">{client.planName ?? "—"}</td>
                <td className="px-4 py-3">{client.tenantStatus}</td>
                <td className="px-4 py-3">{client.subscriptionStatus ?? "—"}</td>
                <td className="px-4 py-3 text-right text-red-700">{formatBRL(client.overdueCents)}</td>
                <td className="px-4 py-3 text-right">{client.openInvoices}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/admin/clientes/${client.tenantId}`} className="text-xs text-brand-700 hover:underline">
                    Ver
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
