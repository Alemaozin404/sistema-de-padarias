import {
  createPromotionCouponAction,
  generateSecretKeysAction,
  revokeSecretKeyAction,
} from "@/modules/promotions/admin-actions";
import { listSecretKeys } from "@/modules/promotions/secret-keys";
import { listCouponRedemptions } from "@/modules/promotions/coupons";
import { listCoupons, listPlatformPlans } from "@/modules/platform/queries";
import { getPlatformSession } from "@/lib/platform-auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Central de promoções" };

export default async function PromocoesPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; ok?: string }>;
}) {
  const params = await searchParams;
  const [coupons, keys, redemptions, plans, session] = await Promise.all([
    listCoupons(),
    listSecretKeys(),
    listCouponRedemptions(),
    listPlatformPlans(),
    getPlatformSession(),
  ]);
  const canAct = session?.role === "OWNER";

  const activeCoupons = coupons.filter((c) => c.coupon.isActive).length;
  const expiredCoupons = coupons.filter(
    (c) => c.coupon.validTo && new Date(c.coupon.validTo) < new Date(),
  ).length;
  const totalRedemptions = coupons.reduce((sum, c) => sum + (c.coupon.redemptions ?? 0), 0);
  const activeKeys = keys.filter((k) => k.key.status === "ACTIVE").length;
  const redeemedKeys = keys.reduce((sum, k) => sum + (k.key.redemptions ?? 0), 0);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">Plataforma</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink">Central de promoções</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Cupons, Secret Keys e benefícios promocionais. Apenas o proprietário pode alterar.
        </p>
      </div>

      {params.erro ? (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{params.erro}</p>
      ) : null}
      {params.ok ? (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{params.ok}</p>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-white p-4">
          <p className="text-xs text-ink-muted">Cupons criados</p>
          <p className="mt-1 text-2xl font-semibold">{coupons.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-white p-4">
          <p className="text-xs text-ink-muted">Cupons ativos</p>
          <p className="mt-1 text-2xl font-semibold">{activeCoupons}</p>
        </div>
        <div className="rounded-xl border border-border bg-white p-4">
          <p className="text-xs text-ink-muted">Cupons expirados</p>
          <p className="mt-1 text-2xl font-semibold">{expiredCoupons}</p>
        </div>
        <div className="rounded-xl border border-border bg-white p-4">
          <p className="text-xs text-ink-muted">Utilizações de cupons</p>
          <p className="mt-1 text-2xl font-semibold">{totalRedemptions}</p>
        </div>
        <div className="rounded-xl border border-border bg-white p-4">
          <p className="text-xs text-ink-muted">Secret Keys geradas</p>
          <p className="mt-1 text-2xl font-semibold">{keys.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-white p-4">
          <p className="text-xs text-ink-muted">Secret Keys ativas</p>
          <p className="mt-1 text-2xl font-semibold">{activeKeys}</p>
        </div>
        <div className="rounded-xl border border-border bg-white p-4">
          <p className="text-xs text-ink-muted">Secret Keys resgatadas</p>
          <p className="mt-1 text-2xl font-semibold">{redeemedKeys}</p>
        </div>
        <div className="rounded-xl border border-border bg-white p-4">
          <p className="text-xs text-ink-muted">Resgates (cupons)</p>
          <p className="mt-1 text-2xl font-semibold">{redemptions.length}</p>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <form action={createPromotionCouponAction} className="space-y-3 rounded-xl border border-border bg-white p-5">
          <h2 className="text-sm font-semibold">Novo cupom promocional</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-ink-muted">Nome</label>
              <input name="name" disabled={!canAct} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-ink-muted">Código</label>
              <input name="code" required disabled={!canAct} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm uppercase" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-ink-muted">Descrição</label>
              <input name="description" disabled={!canAct} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-ink-muted">Tipo</label>
              <select name="discountType" disabled={!canAct} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm">
                <option value="PERCENT">Percentual</option>
                <option value="FIXED">Valor fixo</option>
                <option value="FREE">100% OFF</option>
                <option value="ACTIVATION">Isenção de ativação</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-ink-muted">Valor</label>
              <input name="value" inputMode="decimal" disabled={!canAct} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-ink-muted">Plano (opcional)</label>
              <select name="planId" disabled={!canAct} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm">
                <option value="">Todos</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-ink-muted">Duração (meses)</label>
              <input name="durationCycles" defaultValue="1" inputMode="numeric" disabled={!canAct} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-ink-muted">Válido de</label>
              <input name="validFrom" type="date" disabled={!canAct} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-ink-muted">Válido até</label>
              <input name="validTo" type="date" disabled={!canAct} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-ink-muted">Máx. usos</label>
              <input name="maxRedemptions" inputMode="numeric" disabled={!canAct} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-ink-muted">Máx. por cliente</label>
              <input name="maxPerTenant" defaultValue="1" inputMode="numeric" disabled={!canAct} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="isPublic" defaultChecked disabled={!canAct} />
              Público
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="appliesToActivation" disabled={!canAct} />
              Incluir taxa de ativação
            </label>
          </div>
          {canAct ? (
            <button type="submit" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
              Criar cupom
            </button>
          ) : null}
        </form>

        <form action={generateSecretKeysAction} className="space-y-3 rounded-xl border border-border bg-white p-5">
          <h2 className="text-sm font-semibold">Gerar Secret Keys</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-ink-muted">Quantidade</label>
              <input name="count" defaultValue="10" inputMode="numeric" disabled={!canAct} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-ink-muted">Nome</label>
              <input name="name" disabled={!canAct} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-ink-muted">Plano</label>
              <select name="planId" disabled={!canAct} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm">
                <option value="">Manter atual</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-ink-muted">Tipo de benefício</label>
              <select name="grantType" disabled={!canAct} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm">
                <option value="FREE">100% grátis</option>
                <option value="PERCENT">Percentual</option>
                <option value="FIXED">Valor fixo</option>
                <option value="ACTIVATION">Isenção ativação</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-ink-muted">Valor</label>
              <input name="value" defaultValue="100" inputMode="decimal" disabled={!canAct} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-ink-muted">Duração (dias)</label>
              <input name="durationDays" inputMode="numeric" disabled={!canAct} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-ink-muted">Duração (meses)</label>
              <input name="durationCycles" inputMode="numeric" disabled={!canAct} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-ink-muted">Expira em</label>
              <input name="expiresAt" type="date" disabled={!canAct} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-ink-muted">Máx. resgates</label>
              <input name="maxRedemptions" defaultValue="1" inputMode="numeric" disabled={!canAct} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="lifetime" disabled={!canAct} />
              Vitalício
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="waiveActivation" defaultChecked disabled={!canAct} />
              Isentar ativação
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="anyPlan" disabled={!canAct} />
              Qualquer plano
            </label>
          </div>
          {canAct ? (
            <button type="submit" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
              Gerar chaves
            </button>
          ) : null}
        </form>
      </div>

      <section className="rounded-xl border border-border bg-white p-5">
        <h2 className="text-sm font-semibold">Secret Keys geradas</h2>
        {keys.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">Nenhuma chave gerada.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-ink-muted">
                <tr>
                  <th className="py-2">Prefixo</th>
                  <th className="py-2">Plano</th>
                  <th className="py-2">Tipo</th>
                  <th className="py-2">Resgates</th>
                  <th className="py-2">Status</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {keys.map(({ key, planName }) => (
                  <tr key={key.id} className="border-t border-border">
                    <td className="py-2 font-mono text-xs">{key.codePrefix}</td>
                    <td className="py-2">{planName ?? (key.anyPlan ? "Qualquer" : "—")}</td>
                    <td className="py-2">{key.grantType}</td>
                    <td className="py-2">{key.redemptions}/{key.maxRedemptions}</td>
                    <td className="py-2">{key.status}</td>
                    <td className="py-2 text-right">
                      {canAct && key.status === "ACTIVE" ? (
                        <form action={revokeSecretKeyAction}>
                          <input type="hidden" name="secretKeyId" value={key.id} />
                          <button type="submit" className="text-xs text-red-700 hover:underline">
                            Revogar
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
      </section>

      <section className="rounded-xl border border-border bg-white p-5">
        <h2 className="text-sm font-semibold">Resgates de cupons</h2>
        {redemptions.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">Nenhum resgate.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-ink-muted">
                <tr>
                  <th className="py-2">Cupom</th>
                  <th className="py-2">Padaria</th>
                  <th className="py-2">Desconto</th>
                  <th className="py-2">Final</th>
                  <th className="py-2">Data</th>
                </tr>
              </thead>
              <tbody>
                {redemptions.map((r) => (
                  <tr key={r.redemption.id} className="border-t border-border">
                    <td className="py-2 font-mono text-xs">{r.couponCode}</td>
                    <td className="py-2">{r.tenantTradeName}</td>
                    <td className="py-2">{(r.redemption.discountCents / 100).toFixed(2)}</td>
                    <td className="py-2">{(r.redemption.finalAmountCents / 100).toFixed(2)}</td>
                    <td className="py-2 text-xs">{new Date(r.redemption.redeemedAt).toLocaleDateString("pt-BR")}</td>
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
