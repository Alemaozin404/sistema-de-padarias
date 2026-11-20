import { updatePlanAction } from "@/modules/platform/plan-actions";
import { getPlanEditor } from "@/modules/platform/queries";
import { getPlatformSession } from "@/lib/platform-auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Planos e limites" };

export default async function PlatformPlansPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; ok?: string }>;
}) {
  const params = await searchParams;
  const [{ plans, features, links }, session] = await Promise.all([
    getPlanEditor(),
    getPlatformSession(),
  ]);
  const canAct = session?.role === "OWNER";

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">Plataforma</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink">Planos e limites</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Alterações valem para novas assinaturas; o preço já contratado fica no snapshot de
          cada cliente.
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
          Perfil de suporte: visualização apenas. Alterações exigem o proprietário reautenticado.
        </p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        {plans.map((plan) => {
          const planLinks = new Map(
            links.filter((link) => link.planId === plan.id).map((link) => [link.featureKey, link]),
          );

          return (
            <form
              key={plan.id}
              action={updatePlanAction}
              className="space-y-4 rounded-xl border border-border bg-white p-5"
            >
              <input type="hidden" name="planId" value={plan.id} />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wider text-ink-muted">{plan.code}</p>
                  <h2 className="text-lg font-semibold">{plan.name}</h2>
                </div>
                <span className="text-xs text-ink-muted">
                  {plan.isActive ? "ativo" : "inativo"}
                </span>
              </div>

              <div>
                <label htmlFor={`name-${plan.id}`} className="block text-xs text-ink-muted">
                  Nome
                </label>
                <input
                  id={`name-${plan.id}`}
                  name="name"
                  defaultValue={plan.name}
                  disabled={!canAct}
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label htmlFor={`description-${plan.id}`} className="block text-xs text-ink-muted">
                  Descrição
                </label>
                <textarea
                  id={`description-${plan.id}`}
                  name="description"
                  defaultValue={plan.description ?? ""}
                  rows={2}
                  disabled={!canAct}
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor={`price-${plan.id}`} className="block text-xs text-ink-muted">
                    Mensalidade (R$)
                  </label>
                  <input
                    id={`price-${plan.id}`}
                    name="price"
                    inputMode="decimal"
                    defaultValue={(plan.priceCents / 100).toFixed(2)}
                    disabled={!canAct}
                    className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor={`activation-${plan.id}`} className="block text-xs text-ink-muted">
                    Ativação (R$)
                  </label>
                  <input
                    id={`activation-${plan.id}`}
                    name="activation"
                    inputMode="decimal"
                    defaultValue={(plan.activationFeeCents / 100).toFixed(2)}
                    disabled={!canAct}
                    className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="isActive"
                    defaultChecked={plan.isActive}
                    disabled={!canAct}
                  />
                  Ativo
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="isFeatured"
                    defaultChecked={plan.isFeatured}
                    disabled={!canAct}
                  />
                  Destaque
                </label>
              </div>

              <div className="border-t border-border pt-3">
                <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">
                  Limites e recursos
                </p>
                <div className="mt-2 space-y-2">
                  {features.map((feature) => {
                    const link = planLinks.get(feature.key);
                    return (
                      <div key={feature.key} className="flex items-center justify-between gap-2">
                        <label className="flex flex-1 items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            name={`enabled__${feature.key}`}
                            defaultChecked={link?.isEnabled ?? false}
                            disabled={!canAct}
                          />
                          <span title={feature.key}>{feature.name}</span>
                        </label>
                        {feature.valueType === "LIMIT" ? (
                          <input
                            name={`limit__${feature.key}`}
                            defaultValue={link?.limitValue ?? ""}
                            placeholder="sem teto"
                            inputMode="numeric"
                            disabled={!canAct}
                            aria-label={`Limite de ${feature.name}`}
                            className="w-20 rounded border border-border px-2 py-1 text-right text-xs"
                          />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>

              {canAct ? (
                <button
                  type="submit"
                  className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
                >
                  Salvar plano
                </button>
              ) : null}
            </form>
          );
        })}
      </div>
    </div>
  );
}
