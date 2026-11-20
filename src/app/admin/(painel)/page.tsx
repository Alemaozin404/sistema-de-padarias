import Link from "next/link";
import { getPlatformOverview, getSystemSnapshot, getMasterMetrics, getMonthlyGrowth } from "@/modules/platform/queries";
import { formatBRL } from "@/modules/shared/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visão geral da plataforma" };

function dateLabel(value: Date | string | null): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(`${value}T12:00:00Z`) : value;
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(date);
}

export default async function PlatformDashboardPage() {
  const [overview, system, metrics, growth] = await Promise.all([
    getPlatformOverview(),
    getSystemSnapshot(),
    getMasterMetrics(),
    getMonthlyGrowth(),
  ]);
  const lastDb = system.health.find((check) => check.target === "DB") ?? null;
  const lastBackup = system.backups[0] ?? null;
  const failedWebhooks = system.webhookFailures.filter((event) => event.status === "FAILED").length;
  const attention = overview.clients
    .filter((client) => client.overdueInvoices > 0 || client.tenantStatus === "SUSPENDED")
    .slice(0, 8);

  const cards = [
    { label: "MRR", value: formatBRL(metrics.mrrCents), hint: "assinaturas ACTIVE" },
    { label: "ARR projetado", value: formatBRL(metrics.arrCents), hint: "MRR x 12" },
    { label: "Faturamento do mês", value: formatBRL(metrics.revenueThisMonthCents), hint: "faturas pagas" },
    { label: "Valores vencidos", value: formatBRL(metrics.overdueCents), hint: "inadimplência" },
    { label: "Usuários totais", value: String(metrics.totalUsers), hint: `${metrics.activeUsers} ativos` },
    { label: "Usuários bloqueados", value: String(metrics.blockedUsers), hint: `${metrics.newUsersToday} novos hoje` },
    { label: "Padarias totais", value: String(metrics.totalTenants), hint: `${metrics.activeTenants} ativas` },
    { label: "Inadimplentes", value: String(metrics.delinquentTenants), hint: "clientes" },
    { label: "Assinaturas ativas", value: String(metrics.subscriptionsActive), hint: `${metrics.subscriptionsCancelled} canceladas` },
    { label: "Assinaturas vencidas", value: String(metrics.subscriptionsOverdue), hint: `${metrics.subscriptionsSuspended} suspensas` },
    { label: "Novos usuários 7 dias", value: String(metrics.newUsers7Days), hint: "cadastros" },
    { label: "Churn 30 dias", value: String(metrics.churnLast30Days), hint: "assinaturas canceladas" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">Plataforma</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink">Visão geral</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Receita recorrente, clientes e saúde operacional em um só lugar.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-border bg-white p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">{card.label}</p>
            <p className="mt-2 font-display text-2xl font-bold tracking-tight text-ink">{card.value}</p>
            <p className="mt-1 text-xs text-ink-muted">{card.hint}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-white p-5">
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
                <tr key={plan.planId} className="border-t border-border">
                  <td className="py-2">{plan.name}</td>
                  <td className="py-2 text-right">{plan.clients}</td>
                  <td className="py-2 text-right">{formatBRL(plan.mrrCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rounded-xl border border-border bg-white p-5">
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

      <section className="rounded-xl border border-border bg-white p-5">
        <h2 className="text-sm font-semibold">Crescimento de padarias</h2>
        {growth.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">Sem dados.</p>
        ) : (
          <div className="mt-4 flex items-end gap-2">
            {growth.map((row) => {
              const max = Math.max(...growth.map((item) => item.count), 1);
              const height = Math.max(8, (row.count / max) * 120);
              return (
                <div key={row.month} className="flex flex-1 flex-col items-center gap-2">
                  <div className="w-full rounded-t-md bg-brand-600" style={{ height }} />
                  <span className="text-[10px] text-ink-muted">{row.month.slice(5)}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-white p-5">
          <p className="text-xs uppercase tracking-wider text-ink-muted">Banco</p>
          <p className="mt-2 text-lg font-semibold">{lastDb?.status ?? "SEM DADOS"}</p>
          <p className="text-xs text-ink-muted">{dateLabel(lastDb?.checkedAt ?? null)}</p>
        </div>
        <div className="rounded-xl border border-border bg-white p-5">
          <p className="text-xs uppercase tracking-wider text-ink-muted">Último backup</p>
          <p className="mt-2 text-lg font-semibold">{lastBackup?.status ?? "SEM DADOS"}</p>
          <p className="text-xs text-ink-muted">
            restore testado: {lastBackup?.restoreTestedAt ? "sim" : "não"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-white p-5">
          <p className="text-xs uppercase tracking-wider text-ink-muted">Webhooks com erro</p>
          <p className="mt-2 text-lg font-semibold">{failedWebhooks}</p>
          <p className="text-xs text-ink-muted">últimos registros</p>
        </div>
        <div className="rounded-xl border border-border bg-white p-5">
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
