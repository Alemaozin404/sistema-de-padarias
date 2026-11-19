import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthError, requireTenant } from "@/lib/auth";
import { getTenantOverview, type ResolvedFeature } from "@/modules/billing/queries";
import { describeFeature } from "@/modules/plans/queries";
import { formatBRL } from "@/modules/shared/money";
import type { SubscriptionStatus } from "@/modules/plans/entitlements";

function featureLabel(feature: ResolvedFeature): string {
  return describeFeature({
    key: feature.key,
    name: feature.name,
    valueType: feature.valueType,
    unitLabel: feature.unitLabel,
    isEnabled: feature.isEnabled,
    limitValue: feature.limitValue,
  });
}

export const dynamic = "force-dynamic";
export const metadata = { title: "Painel" };

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  PENDING: "Aguardando ativação",
  ACTIVE: "Ativa",
  PAST_DUE: "Em atraso",
  RESTRICTED: "Restrita",
  SUSPENDED: "Suspensa",
  CANCELLED: "Cancelada",
};

const STATUS_STYLE: Record<SubscriptionStatus, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  ACTIVE: "bg-emerald-50 text-emerald-700",
  PAST_DUE: "bg-amber-50 text-amber-700",
  RESTRICTED: "bg-orange-50 text-orange-700",
  SUSPENDED: "bg-red-50 text-red-700",
  CANCELLED: "bg-neutral-100 text-neutral-600",
};

export default async function DashboardPage() {
  let tenantId: string;
  try {
    ({ tenantId } = await requireTenant());
  } catch (error) {
    if (error instanceof AuthError) redirect("/login");
    throw error;
  }

  const overview = await getTenantOverview(tenantId);

  if (!overview) {
    return (
      <p className="rounded-lg border border-black/10 p-6 text-sm text-ink-muted">
        Estabelecimento não encontrado.
      </p>
    );
  }

  const { entitlements, subscription } = overview;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">
          {overview.slug}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{overview.tradeName}</h1>
      </div>

      {entitlements?.warning ? (
        <div
          role="status"
          className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
        >
          {entitlements.warning}
        </div>
      ) : null}

      {!subscription || !entitlements ? (
        <p className="rounded-lg border border-black/10 p-6 text-sm text-ink-muted">
          Nenhuma assinatura encontrada para este estabelecimento. Fale com o suporte.
        </p>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-black/10 p-5">
              <p className="text-xs uppercase tracking-wide text-ink-muted">Plano</p>
              <p className="mt-1 text-lg font-semibold">{entitlements.plan.name}</p>
              <p className="text-sm text-ink-muted">
                {formatBRL(subscription.priceCents)}/mês
              </p>
            </div>

            <div className="rounded-xl border border-black/10 p-5">
              <p className="text-xs uppercase tracking-wide text-ink-muted">Situação</p>
              <span
                className={`mt-1 inline-block rounded-full px-2.5 py-1 text-xs font-medium ${
                  STATUS_STYLE[subscription.status]
                }`}
              >
                {STATUS_LABEL[subscription.status]}
              </span>
              <p className="mt-2 text-sm text-ink-muted">
                {subscription.nextDueDate
                  ? `Próximo vencimento: ${subscription.nextDueDate}`
                  : "Primeiro pagamento pendente"}
              </p>
              <Link
                href="/assinatura"
                className="mt-2 inline-block text-sm font-medium text-brand-700 underline"
              >
                Ver faturas e pagar
              </Link>
            </div>

            <div className="rounded-xl border border-black/10 p-5">
              <p className="text-xs uppercase tracking-wide text-ink-muted">Acesso aos dados</p>
              <p className="mt-1 text-sm">
                Consulta:{" "}
                <strong>{entitlements.access.canReadOwnData ? "liberada" : "bloqueada"}</strong>
              </p>
              <p className="text-sm">
                Exportação:{" "}
                <strong>{entitlements.access.canExportData ? "liberada" : "bloqueada"}</strong>
              </p>
              <p className="text-sm">
                Operação:{" "}
                <strong>
                  {entitlements.access.canWriteOperational ? "liberada" : "suspensa"}
                </strong>
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Recursos do plano</h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {overview.features
                .filter((feature) => feature.isEnabled)
                .map((feature) => (
                  <li
                    key={feature.key}
                    className="rounded-lg border border-black/10 px-4 py-3 text-sm"
                  >
                    {featureLabel(feature)}
                  </li>
                ))}
            </ul>
            <p className="mt-3 text-xs text-ink-muted">
              Catálogo, vitrine, estoque, produção e cobrança já estão disponíveis. Nenhum
              recurso é anunciado aqui antes de estar funcional.
            </p>
          </section>
        </>
      )}

    </div>
  );
}
