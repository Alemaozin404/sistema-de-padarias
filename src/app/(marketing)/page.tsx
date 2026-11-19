import Link from "next/link";
import { listPublicPlans, describeFeature, type PublicPlan } from "@/modules/plans/queries";
import { formatBRL } from "@/modules/shared/money";
import { publicEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

const FEATURES = [
  {
    title: "Vitrine digital",
    text: "Sua padaria com endereço próprio, catálogo, fotos e link para compartilhar no WhatsApp.",
  },
  {
    title: "Gestão inteligente de estoque",
    text: "Entradas, saídas, perdas e alertas de estoque baixo. O saldo é histórico, não um número digitado.",
  },
  {
    title: "Controle de produção",
    text: "Planeje fornadas, registre o que foi produzido e acompanhe a execução da operação.",
  },
  {
    title: "Fichas técnicas e custos",
    text: "Ficha técnica por receita e comparação entre o que foi produzido e o que foi vendido.",
  },
  {
    title: "Gestão de produtos",
    text: "Catálogo organizado com categorias, preços e imagens para a vitrine e para a operação.",
  },
  {
    title: "Exportação e autonomia dos dados",
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
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="font-display text-lg font-semibold tracking-tight text-navy">
            Gestão para padarias
          </Link>
          <nav className="hidden items-center gap-8 text-sm text-slate-600 md:flex">
            <Link href="#recursos" className="transition-colors hover:text-brand-700">
              Recursos
            </Link>
            <Link href="/planos" className="transition-colors hover:text-brand-700">
              Planos
            </Link>
            <Link href="#faq" className="transition-colors hover:text-brand-700">
              Perguntas
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-medium text-slate-600 transition-colors hover:text-navy">
              Entrar
            </Link>
            <Link
              href="/cadastro"
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-brand-700 hover:shadow-md"
            >
              Começar agora
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div className="mx-auto grid max-w-7xl items-center gap-16 px-6 py-20 lg:grid-cols-2 lg:py-28">
            <div className="animate-fade-up">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-700">
                Tecnologia para padarias e panificadoras
              </p>
              <h1 className="font-display mt-6 text-4xl font-semibold leading-[1.05] tracking-tight text-navy sm:text-5xl lg:text-6xl">
                Sua padaria merece uma gestão de outro nível.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600">
                Controle estoque, produção, produtos e vendas em uma única plataforma. Mais
                organização para sua operação. Mais liberdade para crescer.
              </p>
              <div className="mt-10 flex flex-wrap gap-4">
                <Link
                  href="/cadastro"
                  className="rounded-lg bg-brand-600 px-6 py-3 text-sm font-medium text-white shadow-sm transition-all hover:bg-brand-700 hover:shadow-md"
                >
                  Começar agora
                </Link>
                <Link
                  href="/planos"
                  className="rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-medium text-navy transition-all hover:border-brand-600 hover:text-brand-700"
                >
                  Conhecer a plataforma
                </Link>
              </div>
              <div className="mt-10 flex flex-wrap gap-6 text-sm text-slate-500">
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />
                  Sem comissão sobre vendas
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />
                  Seus dados são seus
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />
                  Cancele quando quiser
                </span>
              </div>
            </div>

            <div className="relative animate-fade-up" style={{ animationDelay: "0.1s" }}>
              <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-brand-100 to-slate-100 blur-2xl" />
              <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                  <span className="ml-4 text-xs text-slate-400">painel.gestaopadarias.com.br</span>
                </div>
                <div className="grid gap-4 p-6">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                      <p className="text-xs text-slate-500">Vendas hoje</p>
                      <p className="mt-2 text-xl font-semibold text-navy">R$ 2.840</p>
                    </div>
                    <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                      <p className="text-xs text-slate-500">Estoque baixo</p>
                      <p className="mt-2 text-xl font-semibold text-navy">3 itens</p>
                    </div>
                    <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                      <p className="text-xs text-slate-500">Fornadas</p>
                      <p className="mt-2 text-xl font-semibold text-navy">12</p>
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-white p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-navy">Produtos em destaque</p>
                      <span className="text-xs text-slate-400">Ver todos</span>
                    </div>
                    <div className="mt-4 space-y-3">
                      {["Pão francês", "Bolo de chocolate", "Croissant"].map((item, index) => (
                        <div key={item} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="h-8 w-8 rounded-md bg-brand-50" />
                            <span className="text-sm text-slate-700">{item}</span>
                          </div>
                          <span className="text-sm font-medium text-navy">
                            R$ {(12 + index * 4).toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="recursos" className="border-y border-slate-200 bg-white">
          <div className="mx-auto max-w-7xl px-6 py-20">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-700">
                Recursos
              </p>
              <h2 className="font-display mt-4 text-3xl font-semibold tracking-tight text-navy sm:text-4xl">
                Tudo o que sua operação precisa, em um só lugar.
              </h2>
              <p className="mt-4 text-lg text-slate-600">
                Ferramentas pensadas para a rotina de padarias e panificadoras, do balcão à
                produção.
              </p>
            </div>
            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => (
                <div
                  key={feature.title}
                  className="group rounded-2xl border border-slate-200 bg-white p-6 transition-all hover:border-brand-200 hover:shadow-md"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                    <span className="text-lg">◆</span>
                  </div>
                  <h3 className="mt-5 text-base font-semibold text-navy">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{feature.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-20">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-700">
              Planos
            </p>
            <h2 className="font-display mt-4 text-3xl font-semibold tracking-tight text-navy sm:text-4xl">
              Três formas de começar.
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              O primeiro pagamento reúne a mensalidade e a ativação única, discriminadas na fatura.
            </p>
          </div>

          {unavailable ? (
            <p className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Os planos não puderam ser carregados porque o banco de dados ainda não está
              configurado neste ambiente. Execute as migrations e o seed de dados de referência.
            </p>
          ) : (
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {plans.map((plan) => (
                <div
                  key={plan.code}
                  className={`flex flex-col rounded-2xl border p-8 transition-all ${
                    plan.isFeatured
                      ? "border-brand-600 shadow-lg ring-1 ring-brand-600"
                      : "border-slate-200 hover:border-slate-300 hover:shadow-md"
                  }`}
                >
                  {plan.isFeatured ? (
                    <span className="mb-4 w-fit rounded-full bg-brand-600 px-3 py-1 text-xs font-medium text-white">
                      Mais completo
                    </span>
                  ) : null}
                  <h3 className="text-lg font-semibold text-navy">{plan.name}</h3>
                  <p className="mt-1 text-sm text-slate-600">{plan.description}</p>
                  <p className="mt-6 text-4xl font-semibold text-navy">
                    {formatBRL(plan.priceCents)}
                    <span className="text-base font-normal text-slate-500">/mês</span>
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    Primeiro pagamento: {formatBRL(plan.priceCents + plan.activationFeeCents)}{" "}
                    (mensalidade {formatBRL(plan.priceCents)} + ativação{" "}
                    {formatBRL(plan.activationFeeCents)})
                  </p>
                  <ul className="mt-6 flex-1 space-y-3 text-sm">
                    {plan.features
                      .filter((feature) => feature.isEnabled)
                      .map((feature) => (
                        <li key={feature.key} className="flex gap-2 text-slate-700">
                          <span className="text-brand-600">✓</span>
                          <span>{describeFeature(feature)}</span>
                        </li>
                      ))}
                  </ul>
                  <Link
                    href={`/cadastro?plano=${plan.code}`}
                    className={`mt-8 rounded-lg px-4 py-2.5 text-center text-sm font-medium transition-all ${
                      plan.isFeatured
                        ? "bg-brand-600 text-white shadow-sm hover:bg-brand-700"
                        : "border border-slate-300 text-navy hover:border-brand-600 hover:text-brand-700"
                    }`}
                  >
                    Contratar {plan.name}
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>

        <section id="faq" className="border-t border-slate-200 bg-slate-50">
          <div className="mx-auto max-w-3xl px-6 py-20">
            <h2 className="font-display text-3xl font-semibold tracking-tight text-navy">
              Perguntas frequentes
            </h2>
            <dl className="mt-8 space-y-6">
              {FAQ.map((item) => (
                <div key={item.q} className="rounded-xl border border-slate-200 bg-white p-6">
                  <dt className="font-medium text-navy">{item.q}</dt>
                  <dd className="mt-2 text-sm leading-relaxed text-slate-600">{item.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-6 py-8 text-sm text-slate-500 sm:flex-row sm:justify-between">
          <span>© {new Date().getFullYear()} Gestão para padarias</span>
          <span>Moeda BRL · fuso America/Sao_Paulo</span>
        </div>
      </footer>
    </div>
  );
}
