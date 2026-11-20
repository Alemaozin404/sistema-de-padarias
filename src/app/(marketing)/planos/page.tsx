import Link from "next/link";
import { listPublicPlans, describeFeature } from "@/modules/plans/queries";
import { formatBRL } from "@/modules/shared/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "Planos" };

export default async function PlanosPage() {
  let plans = [] as Awaited<ReturnType<typeof listPublicPlans>>;
  let unavailable = false;

  try {
    plans = await listPublicPlans();
  } catch {
    unavailable = true;
  }

  const featureKeys = [
    ...new Set(plans.flatMap((plan) => plan.features.map((feature) => feature.key))),
  ];

  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <Link href="/" className="text-sm text-ink-muted hover:text-brand-700">
        ← Voltar
      </Link>

      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Compare os planos</h1>
      <p className="mt-2 max-w-2xl text-ink-muted">
        Todos os planos incluem vitrine digital, link público e exportação dos seus dados.
        A ativação é cobrada uma única vez, junto com a primeira mensalidade.
      </p>

      {unavailable ? (
        <p className="mt-8 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
          Planos indisponíveis: o banco de dados não está configurado neste ambiente.
        </p>
      ) : (
        <div className="mt-10 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-3 pr-4 font-medium text-ink-muted">Recurso</th>
                {plans.map((plan) => (
                  <th key={plan.code} className="py-3 pr-4">
                    <div className="font-semibold">{plan.name}</div>
                    <div className="text-ink-muted">
                      {formatBRL(plan.priceCents)}
                      <span className="text-xs">/mês</span>
                    </div>
                    <div className="text-xs font-normal text-ink-muted">
                      Ativação {formatBRL(plan.activationFeeCents)}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {featureKeys.map((key) => {
                const label = plans
                  .flatMap((plan) => plan.features)
                  .find((feature) => feature.key === key);
                if (!label) return null;

                return (
                  <tr key={key} className="border-b border-border">
                    <td className="py-3 pr-4">{label.name}</td>
                    {plans.map((plan) => {
                      const feature = plan.features.find((item) => item.key === key);
                      return (
                        <td key={plan.code} className="py-3 pr-4">
                          {feature?.isEnabled ? describeFeature(feature) : "—"}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              <tr>
                <td className="py-4 pr-4 font-medium">Primeiro pagamento</td>
                {plans.map((plan) => (
                  <td key={plan.code} className="py-4 pr-4 font-medium">
                    {formatBRL(plan.priceCents + plan.activationFeeCents)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-10 flex flex-wrap gap-3">
        {plans.map((plan) => (
          <Link
            key={plan.code}
            href={`/cadastro?plano=${plan.code}`}
            className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            Contratar {plan.name}
          </Link>
        ))}
      </div>
    </div>
  );
}
