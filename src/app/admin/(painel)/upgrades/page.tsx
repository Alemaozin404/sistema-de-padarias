import { listAllUpgrades } from "@/modules/billing/upgrades";
import { listPlatformPlans } from "@/modules/platform/queries";
import { formatBRL } from "@/modules/shared/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "Upgrades" };

export default async function UpgradesPage() {
  const [rows, plans] = await Promise.all([listAllUpgrades(), listPlatformPlans()]);
  const planMap = new Map(plans.map((p) => [p.id, p.name]));

  const totalUpgrades = rows.length;
  const confirmed = rows.filter((r) => r.upgrade.status === "CONFIRMED");
  const pending = rows.filter((r) => r.upgrade.status === "PENDING_PAYMENT");
  const entriesReceived = confirmed.reduce((sum, r) => sum + r.upgrade.entryAmountCents, 0);
  const remainingToCharge = confirmed
    .filter((r) => !r.upgrade.remainingScheduled)
    .reduce((sum, r) => sum + r.upgrade.remainingAmountCents, 0);
  const discountsGranted = rows.reduce((sum, r) => sum + r.upgrade.discountAmountCents, 0);
  const extraRevenue = confirmed.reduce((sum, r) => sum + r.upgrade.finalAmountCents, 0);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">ASSINATURAS</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink">Upgrades de plano</h1>
        <p className="mt-1 text-sm text-ink-muted">Acompanhamento de upgrades com desconto de 25%.</p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total de upgrades", value: String(totalUpgrades) },
          { label: "Confirmados", value: String(confirmed.length) },
          { label: "Pendentes", value: String(pending.length) },
          { label: "Entradas recebidas", value: formatBRL(entriesReceived) },
          { label: "Restante a cobrar", value: formatBRL(remainingToCharge) },
          { label: "Descontos concedidos", value: formatBRL(discountsGranted) },
          { label: "Receita adicional", value: formatBRL(extraRevenue) },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-border bg-white p-5">
            <p className="text-xs uppercase tracking-wider text-ink-muted">{card.label}</p>
            <p className="mt-2 font-display text-2xl font-bold tracking-tight text-ink">{card.value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-border bg-white p-5">
        <h2 className="text-sm font-semibold">Histórico de upgrades</h2>
        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">Nenhum upgrade registrado.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-ink-muted">
                <tr>
                  <th className="py-2">Cliente</th>
                  <th className="py-2">Plano anterior</th>
                  <th className="py-2">Plano novo</th>
                  <th className="py-2 text-right">Original</th>
                  <th className="py-2 text-right">Desconto</th>
                  <th className="py-2 text-right">Entrada</th>
                  <th className="py-2 text-right">Restante</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.upgrade.id} className="border-t border-border">
                    <td className="py-2">{row.tenant.tradeName}</td>
                    <td className="py-2">{planMap.get(row.upgrade.fromPlanId) ?? row.upgrade.fromPriceCents}</td>
                    <td className="py-2">{planMap.get(row.upgrade.toPlanId) ?? row.upgrade.toPriceCents}</td>
                    <td className="py-2 text-right">{formatBRL(row.upgrade.originalAmountCents)}</td>
                    <td className="py-2 text-right">{formatBRL(row.upgrade.discountAmountCents)}</td>
                    <td className="py-2 text-right">{formatBRL(row.upgrade.entryAmountCents)}</td>
                    <td className="py-2 text-right">{formatBRL(row.upgrade.remainingAmountCents)}</td>
                    <td className="py-2">{row.upgrade.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}