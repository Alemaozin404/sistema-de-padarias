import Link from "next/link";
import { getPlatformOverview, getSystemSnapshot } from "@/modules/platform/queries";
import { formatBRL } from "@/modules/shared/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "Suporte" };

export default async function PlatformSupportPage() {
  const [overview, system] = await Promise.all([getPlatformOverview(), getSystemSnapshot()]);
  const attention = overview.clients.filter((client) => client.overdueInvoices > 0 || client.tenantStatus !== "ACTIVE");

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">MASTER CONTROL</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Suporte</h1>
        <p className="mt-1 text-sm text-ink-muted">Clientes que exigem acompanhamento.</p>
      </div>

      <section className="rounded-xl border border-black/10 bg-white p-5">
        <h2 className="text-sm font-semibold">Clientes com pendência</h2>
        {attention.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">Nenhum cliente com pendência.</p>
        ) : (
          <ul className="mt-3 divide-y divide-black/5 text-sm">
            {attention.map((client) => (
              <li key={client.tenantId} className="flex items-center justify-between gap-3 py-2">
                <Link href={`/admin/clientes/${client.tenantId}`} className="font-medium hover:text-brand-700">
                  {client.tradeName}
                </Link>
                <span className="text-xs text-red-700">
                  {client.tenantStatus} · {client.overdueInvoices} fatura(s) · {formatBRL(client.overdueCents)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-5">
        <h2 className="text-sm font-semibold">Incidentes abertos</h2>
        {system.incidents.filter((incident) => incident.status !== "RESOLVED").length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">Nenhum incidente aberto.</p>
        ) : (
          <ul className="mt-3 divide-y divide-black/5 text-sm">
            {system.incidents
              .filter((incident) => incident.status !== "RESOLVED")
              .map((incident) => (
                <li key={incident.id} className="py-2">
                  <p className="font-medium">{incident.title}</p>
                  <p className="text-xs text-ink-muted">{incident.severity} · {incident.status}</p>
                </li>
              ))}
          </ul>
        )}
      </section>
    </div>
  );
}
