import { getFinanceSnapshot } from "@/modules/platform/queries";
import { formatBRL } from "@/modules/shared/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "Financeiro" };

export default async function PlatformFinancePage() {
  const finance = await getFinanceSnapshot();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">MASTER CONTROL</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink">Financeiro</h1>
        <p className="mt-1 text-sm text-ink-muted">Receita recebida, recorrente e pendências.</p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Receita total recebida", value: formatBRL(finance.totalRevenueCents) },
          { label: "MRR", value: formatBRL(finance.mrrCents) },
          { label: "ARR projetado", value: formatBRL(finance.arrCents) },
          { label: "Valores vencidos", value: formatBRL(finance.pendingCents) },
          { label: "Pagamentos aprovados", value: String(finance.approvedPayments) },
          { label: "Pagamentos pendentes", value: String(finance.pendingPayments) },
          { label: "Pagamentos recusados", value: String(finance.refusedPayments) },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-border bg-white p-5">
            <p className="text-xs uppercase tracking-wider text-ink-muted">{card.label}</p>
            <p className="mt-2 font-display text-2xl font-bold tracking-tight text-ink">{card.value}</p>
          </div>
        ))}
      </section>

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
            {finance.byPlan.map((plan) => (
              <tr key={plan.name} className="border-t border-border">
                <td className="py-2">{plan.name}</td>
                <td className="py-2 text-right">{plan.clients}</td>
                <td className="py-2 text-right">{formatBRL(plan.mrrCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-xl border border-border bg-white p-5">
        <h2 className="text-sm font-semibold">Pagamentos recentes</h2>
        {finance.recentPayments.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">Nenhum pagamento registrado.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-ink-muted">
                <tr>
                  <th className="py-2">Cliente</th>
                  <th className="py-2">Método</th>
                  <th className="py-2">Status</th>
                  <th className="py-2 text-right">Valor</th>
                  <th className="py-2">Pago em</th>
                </tr>
              </thead>
              <tbody>
                {finance.recentPayments.map((payment) => (
                  <tr key={payment.id} className="border-t border-border">
                    <td className="py-2">{payment.tradeName}</td>
                    <td className="py-2">{payment.method}</td>
                    <td className="py-2">{payment.status}</td>
                    <td className="py-2 text-right">{formatBRL(payment.amountCents)}</td>
                    <td className="py-2 text-xs">{payment.paidAt ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(payment.paidAt) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-white p-5">
        <h2 className="text-sm font-semibold">Clientes inadimplentes</h2>
        {finance.overdueClients.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">Nenhum cliente inadimplente.</p>
        ) : (
          <ul className="mt-3 divide-y divide-black/5 text-sm">
            {finance.overdueClients.map((client) => (
              <li key={client.tenantId} className="flex items-center justify-between py-2">
                <span>{client.tradeName}</span>
                <span className="text-red-700">
                  {client.overdueInvoices} fatura(s) · {formatBRL(client.overdueCents)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
