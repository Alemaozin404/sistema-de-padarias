import Link from "next/link";
import { getPlatformOverview, getSystemSnapshot } from "@/modules/platform/queries";
import { formatBRL } from "@/modules/shared/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visão geral da plataforma" };

function dateLabel(value: Date | string | null): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(`${value}T12:00:00Z`) : value;
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(date);
}

export default async function PlatformDashboardPage() {
  const [overview, system] = await Promise.all([getPlatformOverview(), getSystemSnapshot()]);
  const lastDb = system.health.find((check) => check.target === "DB") ?? null;
  const lastBackup = system.backups[0] ?? null;
  const failedWebhooks = system.webhookFailures.filter((event) => event.status === "FAILED").length;
  const attention = overview.clients
    .filter((client) => client.overdueInvoices > 0 || client.tenantStatus === "SUSPENDED")
    .slice(0, 8);

  const cards = [
    { label: "MRR", value: formatBRL(overview.mrrCents), hint: "assinaturas ACTIVE" },
    {
      label: "Faturamento do mês",
      value: formatBRL(overview.revenueThisMonthCents),
      hint: "faturas pagas",
    },
    { label: "Clientes ativos", value: String(overview.activeClients), hint: `${overview.totalTenants} no total` },
    {
      label: "Inadimplentes",
      value: String(overview.delinquentClients),
      hint: `${formatBRL(overview.overdueCents)} vencidos`,
    },
    { label: "Novos no mês", value: String(overview.newTenantsThisMonth), hint: "cadastros" },
    { label: "Churn 30 dias", value: String(overview.churnLast30Days), hint: "assinaturas canceladas" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">Plataforma</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Visão geral</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Receita recorrente, clientes e saúde operacional em um só lugar.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-black/10 bg-white p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">{card.value}</p>
            <p className="mt-1 text-xs text-ink-muted">{card.hint}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-black/10 bg-white p-5">
          <h2 className="text-sm font-semibold">Receita por plano</h2>
          <table className="mt-4 w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-ink-muted">
              <tr>
                <th className="pb-2">Plano</th>
                <th className="pb-2 text-right">Ativos</th>
                <th className="pb-2 text-right">MRR</th>
              </tr>
            </thead>
            <tbody>
              {overview.byPlan.map((plan) => (
                <tr key={plan.planId} className="border-t border-black/5">
                  <td className="py-2">{plan.name}</td>
                  <td className="py-2 text-right">{plan.clients}</td>
                  <td className="py-2 text-right">{formatBRL(plan.mrrCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rounded-xl border border-black/10 bg-white p-5">
          <h2 className="text-sm font-semibold">Precisa de atenção</h2>
          {attention.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">Nenhum cliente vencido ou suspenso.</p>
          ) : (
            <ul className="mt-3 divide-y divide-black/5 text-sm">
              {attention.map((client) => (
                <li key={client.tenantId} className="flex items-center justify-between gap-3 py-2">
                  <Link
                    href={`/admin/clientes/${client.tenantId}`}
                    className="font-medium hover:text-brand-700"
                  >
                    {client.tradeName}
                  </Link>
                  <span className="text-xs text-red-700">
                    {client.tenantStatus === "SUSPENDED"
                      ? "suspenso"
                      : `${client.overdueInvoices} fatura(s) · ${formatBRL(client.overdueCents)}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-black/10 bg-white p-5">
          <p className="text-xs uppercase tracking-wider text-ink-muted">Banco</p>
          <p className="mt-2 text-lg font-semibold">{lastDb?.status ?? "SEM DADOS"}</p>
          <p className="text-xs text-ink-muted">{dateLabel(lastDb?.checkedAt ?? null)}</p>
        </div>
        <div className="rounded-xl border border-black/10 bg-white p-5">
          <p className="text-xs uppercase tracking-wider text-ink-muted">Último backup</p>
          <p className="mt-2 text-lg font-semibold">{lastBackup?.status ?? "SEM DADOS"}</p>
          <p className="text-xs text-ink-muted">
            restore testado: {lastBackup?.restoreTestedAt ? "sim" : "não"}
          </p>
        </div>
        <div className="rounded-xl border border-black/10 bg-white p-5">
          <p className="text-xs uppercase tracking-wider text-ink-muted">Webhooks com erro</p>
          <p className="mt-2 text-lg font-semibold">{failedWebhooks}</p>
          <p className="text-xs text-ink-muted">últimos registros</p>
        </div>
        <div className="rounded-xl border border-black/10 bg-white p-5">
          <p className="text-xs uppercase tracking-wider text-ink-muted">Incidentes abertos</p>
          <p className="mt-2 text-lg font-semibold">
            {system.incidents.filter((incident) => incident.status !== "RESOLVED").length}
          </p>
          <Link href="/admin/sistema" className="text-xs text-brand-700 hover:underline">
            Ver sistema
          </Link>
        </div>
      </section>
    </div>
  );
}
