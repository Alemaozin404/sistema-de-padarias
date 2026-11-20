import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlatformSession } from "@/lib/platform-auth";
import {
  adminRegisterPaymentAction,
  changeTenantPlanAction,
  setTenantStatusAction,
} from "@/modules/platform/client-actions";
import { getPlatformClientDetail } from "@/modules/platform/queries";
import { formatBRL } from "@/modules/shared/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cliente" };

function dateLabel(value: Date | string | null): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(`${value}T12:00:00Z`) : value;
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(date);
}

export default async function PlatformClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string; ok?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [detail, session] = await Promise.all([getPlatformClientDetail(id), getPlatformSession()]);
  if (!detail) notFound();

  const { tenant, current, invoices, plans } = detail;
  const canAct = session?.role === "OWNER";
  const currentPlan = plans.find((plan) => plan.id === current?.planId) ?? null;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/clientes" className="text-sm text-ink-muted hover:text-brand-700">
          ← Clientes
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-ink">{tenant.tradeName}</h1>
            <p className="text-sm text-ink-muted">
              /{tenant.slug} · criado em {dateLabel(tenant.createdAt)}
            </p>
          </div>
          <div className="flex gap-2 text-xs">
            <span className="rounded-full bg-neutral-100 px-2.5 py-1">tenant: {tenant.status}</span>
            <span className="rounded-full bg-neutral-100 px-2.5 py-1">
              assinatura: {current?.status ?? "sem assinatura"}
            </span>
          </div>
        </div>
      </div>

      {query.erro ? (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {query.erro}
        </p>
      ) : null}
      {query.ok ? (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
          {query.ok}
        </p>
      ) : null}

      {!canAct ? (
        <p className="rounded-lg bg-neutral-100 p-3 text-sm text-ink-muted">
          Perfil de suporte: leitura liberada, alterações restritas ao proprietário.
        </p>
      ) : (
        <p className="text-xs text-ink-muted">
          Ações sensíveis exigem reautenticação por senha nos últimos 10 minutos. Use o
          campo “Reautenticar” no topo.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-xl border border-border bg-white p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold">Assinatura</h2>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-ink-muted">Plano atual</dt>
              <dd className="font-medium">{currentPlan?.name ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">Mensalidade contratada</dt>
              <dd className="font-medium">{formatBRL(current?.priceCents ?? 0)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">Próximo vencimento</dt>
              <dd className="font-medium">{current?.nextDueDate ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">Período atual até</dt>
              <dd className="font-medium">{dateLabel(current?.currentPeriodEnd ?? null)}</dd>
            </div>
          </dl>

          {canAct && current ? (
            <form action={changeTenantPlanAction} className="mt-5 flex flex-wrap items-end gap-2">
              <input type="hidden" name="tenantId" value={tenant.id} />
              <div>
                <label htmlFor="planId" className="block text-xs text-ink-muted">
                  Trocar plano
                </label>
                <select
                  id="planId"
                  name="planId"
                  defaultValue={current.planId}
                  className="mt-1 rounded-lg border border-border px-3 py-2 text-sm"
                >
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} — {formatBRL(plan.priceCents)}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                Aplicar na próxima fatura
              </button>
            </form>
          ) : null}
        </section>

        <section className="rounded-xl border border-border bg-white p-5">
          <h2 className="text-sm font-semibold">Acesso do cliente</h2>
          <p className="mt-2 text-xs text-ink-muted">
            Suspender o tenant bloqueia o painel operacional, mas preserva leitura,
            exportação e pagamento.
          </p>
          {canAct ? (
            <form action={setTenantStatusAction} className="mt-4">
              <input type="hidden" name="tenantId" value={tenant.id} />
              <input
                type="hidden"
                name="status"
                value={tenant.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"}
              />
              <button
                type="submit"
                className={`w-full rounded-lg px-4 py-2 text-sm font-medium text-white ${
                  tenant.status === "ACTIVE"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-emerald-600 hover:bg-emerald-700"
                }`}
              >
                {tenant.status === "ACTIVE" ? "Suspender cliente" : "Reativar cliente"}
              </button>
            </form>
          ) : (
            <p className="mt-4 text-sm text-ink-muted">{tenant.status}</p>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-border bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Faturas recentes</h2>
          <Link href={`/admin/clientes/${tenant.id}/visualizar`} className="text-xs text-brand-700 hover:underline">
            Visualizar ambiente
          </Link>
        </div>

        {invoices.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">Nenhuma fatura registrada.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-ink-muted">
                <tr>
                  <th className="py-2">Tipo</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Vencimento</th>
                  <th className="py-2 text-right">Total</th>
                  <th className="py-2">Pago em</th>
                  <th className="py-2">Ação</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => {
                  const payable = invoice.status === "OPEN" || invoice.status === "OVERDUE";
                  return (
                    <tr key={invoice.id} className="border-t border-border align-top">
                      <td className="py-2">{invoice.kind}</td>
                      <td className="py-2">{invoice.status}</td>
                      <td className="py-2">{invoice.dueDate}</td>
                      <td className="py-2 text-right">{formatBRL(invoice.totalCents)}</td>
                      <td className="py-2">{dateLabel(invoice.paidAt)}</td>
                      <td className="py-2">
                        {canAct && payable ? (
                          <form action={adminRegisterPaymentAction} className="flex flex-wrap items-center gap-1">
                            <input type="hidden" name="tenantId" value={tenant.id} />
                            <input type="hidden" name="invoiceId" value={invoice.id} />
                            <select
                              name="method"
                              aria-label="Método do pagamento"
                              className="rounded border border-border px-1.5 py-1 text-xs"
                            >
                              <option value="PIX">Pix</option>
                              <option value="CARD">Cartão</option>
                              <option value="BOLETO">Boleto</option>
                            </select>
                            <button
                              type="submit"
                              className="rounded bg-brand-600 px-2 py-1 text-xs font-medium text-white hover:bg-brand-700"
                            >
                              Registrar pagamento
                            </button>
                          </form>
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
        )}
      </section>
    </div>
  );
}
