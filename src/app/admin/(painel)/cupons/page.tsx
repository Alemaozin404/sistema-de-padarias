import {
  createCouponAction,
  createTenantDiscountAction,
  toggleCouponAction,
} from "@/modules/platform/coupon-actions";
import {
  listCoupons,
  listNegotiatedDiscounts,
  listPlatformPlans,
  listTenantOptions,
} from "@/modules/platform/queries";
import { getPlatformSession } from "@/lib/platform-auth";
import { formatBRL } from "@/modules/shared/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cupons e descontos" };

function dateLabel(value: Date | string | null): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(`${value}T12:00:00Z`) : value;
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(date);
}

function discountLabel(type: string, value: number): string {
  return type === "PERCENT" ? `${value}%` : formatBRL(value);
}

export default async function PlatformCouponsPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; ok?: string }>;
}) {
  const params = await searchParams;
  const [couponRows, discounts, tenants, plans, session] = await Promise.all([
    listCoupons(),
    listNegotiatedDiscounts(),
    listTenantOptions(),
    listPlatformPlans(),
    getPlatformSession(),
  ]);
  const canAct = session?.role === "OWNER";

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">Plataforma</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Cupons e descontos</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Descontos negociados com vigência entram nas próximas faturas do cliente. Cupons
          ficam cadastrados para resgate no checkout.
        </p>
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

      {!canAct ? (
        <p className="rounded-lg bg-neutral-100 p-3 text-sm text-ink-muted">
          Perfil de suporte: visualização apenas. Criar ou alterar descontos exige o
          proprietário reautenticado.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <form action={createCouponAction} className="space-y-3 rounded-xl border border-black/10 bg-white p-5">
          <h2 className="text-sm font-semibold">Novo cupom</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="coupon-code" className="block text-xs text-ink-muted">
                Código
              </label>
              <input
                id="coupon-code"
                name="code"
                required
                disabled={!canAct}
                placeholder="BEMVINDO10"
                className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm uppercase"
              />
            </div>
            <div>
              <label htmlFor="coupon-type" className="block text-xs text-ink-muted">
                Tipo
              </label>
              <select
                id="coupon-type"
                name="discountType"
                disabled={!canAct}
                className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm"
              >
                <option value="PERCENT">Percentual</option>
                <option value="FIXED">Valor fixo (R$)</option>
              </select>
            </div>
            <div>
              <label htmlFor="coupon-value" className="block text-xs text-ink-muted">
                Valor
              </label>
              <input
                id="coupon-value"
                name="value"
                required
                disabled={!canAct}
                inputMode="decimal"
                placeholder="10 ou 19,90"
                className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="coupon-plan" className="block text-xs text-ink-muted">
                Plano (opcional)
              </label>
              <select
                id="coupon-plan"
                name="planId"
                disabled={!canAct}
                className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm"
              >
                <option value="">Todos</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="coupon-from" className="block text-xs text-ink-muted">
                Válido de
              </label>
              <input
                id="coupon-from"
                name="validFrom"
                type="date"
                disabled={!canAct}
                className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="coupon-to" className="block text-xs text-ink-muted">
                Válido até
              </label>
              <input
                id="coupon-to"
                name="validTo"
                type="date"
                disabled={!canAct}
                className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label htmlFor="coupon-max" className="block text-xs text-ink-muted">
              Máximo de usos (opcional)
            </label>
            <input
              id="coupon-max"
              name="maxRedemptions"
              inputMode="numeric"
              disabled={!canAct}
              className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm"
            />
          </div>
          {canAct ? (
            <button
              type="submit"
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Criar cupom
            </button>
          ) : null}
        </form>

        <form
          action={createTenantDiscountAction}
          className="space-y-3 rounded-xl border border-black/10 bg-white p-5"
        >
          <h2 className="text-sm font-semibold">Desconto negociado por cliente</h2>
          <div>
            <label htmlFor="discount-tenant" className="block text-xs text-ink-muted">
              Cliente
            </label>
            <select
              id="discount-tenant"
              name="tenantId"
              required
              disabled={!canAct}
              className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm"
            >
              <option value="">Selecione</option>
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.tradeName} ({tenant.status})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="discount-type" className="block text-xs text-ink-muted">
                Tipo
              </label>
              <select
                id="discount-type"
                name="discountType"
                disabled={!canAct}
                className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm"
              >
                <option value="PERCENT">Percentual</option>
                <option value="FIXED">Valor fixo (R$)</option>
              </select>
            </div>
            <div>
              <label htmlFor="discount-value" className="block text-xs text-ink-muted">
                Valor
              </label>
              <input
                id="discount-value"
                name="value"
                required
                inputMode="decimal"
                disabled={!canAct}
                className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="discount-from" className="block text-xs text-ink-muted">
                Vigência de
              </label>
              <input
                id="discount-from"
                name="validFrom"
                type="date"
                required
                disabled={!canAct}
                className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="discount-to" className="block text-xs text-ink-muted">
                Vigência até
              </label>
              <input
                id="discount-to"
                name="validTo"
                type="date"
                disabled={!canAct}
                className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label htmlFor="discount-reason" className="block text-xs text-ink-muted">
              Motivo da negociação
            </label>
            <textarea
              id="discount-reason"
              name="reason"
              required
              rows={2}
              disabled={!canAct}
              className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm"
            />
          </div>
          {canAct ? (
            <button
              type="submit"
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Registrar desconto
            </button>
          ) : null}
        </form>
      </div>

      <section className="rounded-xl border border-black/10 bg-white p-5">
        <h2 className="text-sm font-semibold">Cupons cadastrados</h2>
        {couponRows.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">Nenhum cupom cadastrado.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-ink-muted">
                <tr>
                  <th className="py-2">Código</th>
                  <th className="py-2">Desconto</th>
                  <th className="py-2">Plano</th>
                  <th className="py-2">Vigência</th>
                  <th className="py-2 text-right">Usos</th>
                  <th className="py-2">Status</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {couponRows.map(({ coupon, planName }) => (
                  <tr key={coupon.id} className="border-t border-black/5">
                    <td className="py-2 font-mono text-xs">{coupon.code}</td>
                    <td className="py-2">{discountLabel(coupon.discountType, coupon.value)}</td>
                    <td className="py-2">{planName ?? "Todos"}</td>
                    <td className="py-2 text-xs">
                      {dateLabel(coupon.validFrom)} → {dateLabel(coupon.validTo)}
                    </td>
                    <td className="py-2 text-right">
                      {coupon.redemptions}
                      {coupon.maxRedemptions ? `/${coupon.maxRedemptions}` : ""}
                    </td>
                    <td className="py-2">{coupon.isActive ? "ativo" : "inativo"}</td>
                    <td className="py-2 text-right">
                      {canAct ? (
                        <form action={toggleCouponAction}>
                          <input type="hidden" name="couponId" value={coupon.id} />
                          <button
                            type="submit"
                            className="text-xs text-brand-700 hover:underline"
                          >
                            {coupon.isActive ? "Desativar" : "Ativar"}
                          </button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-ink-muted">
          Cupons ainda não são resgatados automaticamente no checkout; ficam registrados para
          a etapa de aplicação no fluxo de compra.
        </p>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-5">
        <h2 className="text-sm font-semibold">Descontos negociados</h2>
        {discounts.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">Nenhum desconto registrado.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-ink-muted">
                <tr>
                  <th className="py-2">Cliente</th>
                  <th className="py-2">Desconto</th>
                  <th className="py-2">Vigência</th>
                  <th className="py-2">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {discounts.map((discount) => (
                  <tr key={discount.id} className="border-t border-black/5">
                    <td className="py-2">{discount.tradeName}</td>
                    <td className="py-2">
                      {discountLabel(discount.discountType, discount.value)}
                    </td>
                    <td className="py-2 text-xs">
                      {dateLabel(discount.validFrom)} → {dateLabel(discount.validTo)}
                    </td>
                    <td className="py-2 text-xs">{discount.reason}</td>
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
