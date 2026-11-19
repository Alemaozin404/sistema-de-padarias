import Link from "next/link";
import { listPublicPlans, describeFeature, type PublicPlan } from "@/modules/plans/queries";
import { formatBRL } from "@/modules/shared/money";
import { publicEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

const BENEFITS = [
  {
    title: "Vitrine própria, sem comissão",
    text: "Sua padaria com endereço próprio, catálogo, fotos e link para compartilhar no WhatsApp.",
  },
  {
    title: "Estoque que fecha a conta",
    text: "Entradas, saídas, perdas e alertas de estoque baixo. O saldo é histórico, não um número digitado.",
  },
  {
    title: "Produção com custo real",
    text: "Ficha técnica, fornada registrada e comparação entre o que foi produzido e o que foi vendido.",
  },
  {
    title: "Seus dados são seus",
    text: "Mesmo em atraso, consulta e exportação dos seus dados continuam liberadas. Sem refém de informação.",
  },
];

const FAQ = [
  {
    q: "Preciso instalar algo?",
    a: "Não. A plataforma roda no navegador do computador e do celular, com a mesma conta.",
  },
  {
    q: "O primeiro pagamento é diferente?",
    a: "Sim. O primeiro pagamento reúne a mensalidade do plano e a ativação única do estabelecimento. Nos meses seguintes você paga apenas a mensalidade.",
  },
  {
    q: "O que acontece se eu atrasar?",
    a: "Você recebe avisos antes e depois do vencimento, com prazo para regularizar. Em nenhuma hipótese seus dados são apagados ou sua exportação é bloqueada.",
  },
  {
    q: "Posso trocar de plano?",
    a: "Sim. A troca é feita pelo painel de assinatura ou pelo suporte, passando a valer no próximo ciclo.",
  },
  {
    q: "Posso cancelar?",
    a: "Sim. O acesso permanece até o fim do período já pago, e seus dados ficam disponíveis para exportação.",
  },
];

export default async function MarketingPage() {
  let plans: PublicPlan[] = [];
  let unavailable = false;

  try {
    plans = await listPublicPlans();
  } catch {
    unavailable = true;
  }

  const whatsapp = publicEnv.NEXT_PUBLIC_WHATSAPP_SUPPORT;

  return (
    <div>
      <header className="border-b border-black/5">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="font-semibold tracking-tight">Gestão para padarias</span>
          <nav className="flex items-center gap-6 text-sm">
            <Link href="#recursos" className="hover:text-brand-700">
              Recursos
            </Link>
            <Link href="/planos" className="hover:text-brand-700">
              Planos
            </Link>
            <Link href="/login" className="hover:text-brand-700">
              Entrar
            </Link>
            <Link
              href="/cadastro"
              className="rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700"
            >
              Começar
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-6 py-20">
          <p className="text-sm font-medium uppercase tracking-wider text-brand-700">
            Tecnologia para padarias e panificadoras
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Liberdade e controle para o seu estabelecimento.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-ink-muted">
            Vitrine digital, produtos, estoque e produção em uma única plataforma. Você assina
            mês a mês e mantém a autonomia sobre o seu negócio e os seus dados.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/cadastro"
              className="rounded-lg bg-brand-600 px-6 py-3 font-medium text-white hover:bg-brand-700"
            >
              Criar minha conta
            </Link>
            {whatsapp ? (
              <a
                href={`https://wa.me/${whatsapp}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-black/10 px-6 py-3 font-medium hover:bg-brand-50"
              >
                Falar com o comercial
              </a>
            ) : null}
          </div>
        </section>

        <section id="recursos" className="border-y border-black/5 bg-brand-50/40">
          <div className="mx-auto grid max-w-6xl gap-8 px-6 py-16 sm:grid-cols-2">
            {BENEFITS.map((benefit) => (
              <div key={benefit.title} className="rounded-xl bg-white p-6 shadow-sm">
                <h3 className="font-semibold">{benefit.title}</h3>
                <p className="mt-2 text-sm text-ink-muted">{benefit.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-2xl font-semibold tracking-tight">Planos</h2>
          <p className="mt-2 text-ink-muted">
            Três formas de começar. O primeiro pagamento reúne a mensalidade e a ativação única,
            discriminadas na fatura.
          </p>

          {unavailable ? (
            <p className="mt-8 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
              Os planos não puderam ser carregados porque o banco de dados ainda não está
              configurado neste ambiente. Execute as migrations e o seed de dados de referência.
            </p>
          ) : (
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              {plans.map((plan) => (
                <div
                  key={plan.code}
                  className={`flex flex-col rounded-xl border p-6 ${
                    plan.isFeatured
                      ? "border-brand-600 ring-1 ring-brand-600"
                      : "border-black/10"
                  }`}
                >
                  {plan.isFeatured ? (
                    <span className="mb-3 w-fit rounded-full bg-brand-600 px-3 py-1 text-xs font-medium text-white">
                      Mais completo
                    </span>
                  ) : null}
                  <h3 className="text-lg font-semibold">{plan.name}</h3>
                  <p className="mt-1 text-sm text-ink-muted">{plan.description}</p>
                  <p className="mt-4 text-3xl font-semibold">
                    {formatBRL(plan.priceCents)}
                    <span className="text-sm font-normal text-ink-muted">/mês</span>
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    Primeiro pagamento:{" "}
                    {formatBRL(plan.priceCents + plan.activationFeeCents)} (mensalidade{" "}
                    {formatBRL(plan.priceCents)} + ativação {formatBRL(plan.activationFeeCents)})
                  </p>
                  <ul className="mt-5 flex-1 space-y-2 text-sm">
                    {plan.features
                      .filter((feature) => feature.isEnabled)
                      .map((feature) => (
                        <li key={feature.key} className="flex gap-2">
                          <span aria-hidden className="text-brand-600">
                            ✓
                          </span>
                          <span>{describeFeature(feature)}</span>
                        </li>
                      ))}
                  </ul>
                  <Link
                    href={`/cadastro?plano=${plan.code}`}
                    className="mt-6 rounded-lg border border-brand-600 px-4 py-2 text-center text-sm font-medium text-brand-700 hover:bg-brand-50"
                  >
                    Contratar {plan.name}
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="border-t border-black/5 bg-brand-50/40">
          <div className="mx-auto max-w-3xl px-6 py-16">
            <h2 className="text-2xl font-semibold tracking-tight">Perguntas frequentes</h2>
            <dl className="mt-6 space-y-6">
              {FAQ.map((item) => (
                <div key={item.q}>
                  <dt className="font-medium">{item.q}</dt>
                  <dd className="mt-1 text-sm text-ink-muted">{item.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </main>

      <footer className="border-t border-black/5">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-8 text-sm text-ink-muted sm:flex-row sm:justify-between">
          <span>© {new Date().getFullYear()} Gestão para padarias</span>
          <span>Moeda BRL · fuso America/Sao_Paulo</span>
        </div>
      </footer>
    </div>
  );
}
