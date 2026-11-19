import Link from "next/link";
import { getPlatformOverview } from "@/modules/platform/queries";
import { formatBRL } from "@/modules/shared/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clientes" };

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700",
  PAST_DUE: "bg-amber-50 text-amber-700",
  RESTRICTED: "bg-orange-50 text-orange-700",
  SUSPENDED: "bg-red-50 text-red-700",
  PENDING: "bg-amber-50 text-amber-700",
  CANCELLED: "bg-neutral-100 text-neutral-600",
};

export default async function PlatformClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; ok?: string }>;
}) {
  const params = await searchParams;
  const overview = await getPlatformOverview();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">Plataforma</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Clientes</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {overview.totalTenants} estabelecimento(s), {overview.activeClients} ativo(s).
          </p>
        </div>
      </div>

      {params.erro ? (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {params.erro}
        </p>
      ) : null}
      {params.ok ? (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
          {params.ok}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-black/10 bg-white">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="border-b border-black/10 text-left text-xs uppercase tracking-wider text-ink-muted">
            <tr>
              <th className="px-4 py-3">Estabelecimento</th>
              <th className="px-4 py-3">Plano</th>
              <th className="px-4 py-3">Assinatura</th>
              <th className="px-4 py-3">Tenant</th>
              <th className="px-4 py-3 text-right">Mensalidade</th>
              <th className="px-4 py-3">Próximo venc.</th>
              <th className="px-4 py-3 text-right">Vencido</th>
            </tr>
          </thead>
          <tbody>
            {overview.clients.map((client) => {
              const status = client.subscriptionStatus ?? "—";
              return (
                <tr key={client.tenantId} className="border-b border-black/5 last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/clientes/${client.tenantId}`}
                      className="font-medium hover:text-brand-700"
                    >
                      {client.tradeName}
                    </Link>
                    <p className="text-xs text-ink-muted">/{client.slug}</p>
                  </td>
                  <td className="px-4 py-3">{client.planName ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        STATUS_STYLE[status] ?? "bg-neutral-100 text-neutral-600"
                      }`}
                    >
                      {status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        client.tenantStatus === "ACTIVE"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-red-50 text-red-700"
                      }`}
                    >
                      {client.tenantStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">{formatBRL(client.priceCents)}</td>
                  <td className="px-4 py-3">{client.nextDueDate ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    {client.overdueCents > 0 ? (
                      <span className="text-red-700">{formatBRL(client.overdueCents)}</span>
                    ) : (
                      "—"
                    )}
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
