import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthError, requireTenant } from "@/lib/auth";
import { getTenantOverview } from "@/modules/billing/queries";
import { listPublicPlans } from "@/modules/plans/queries";
import { listUpgradeOptions } from "@/modules/billing/upgrades";
import { listInvoices, type InvoiceRow } from "@/modules/billing/service";
import { isGatewayConfigured } from "@/modules/billing/gateway";
import { todayIso } from "@/modules/billing/rules";
import { formatBRL } from "@/modules/shared/money";
import { CancelChargeForm, ChargeForm, CheckoutForm, ReconcileForm, RequestCancellationForm, RequestRefundForm, SubscribePlanForm, UpgradeForm } from "@/components/billing/billing-forms";
import { pendingRemainingCents } from "@/modules/billing/upgrades";
import { listRefundRequests } from "@/modules/billing/refunds";
import { MercadoPagoCheckout } from "@/components/billing/mercadopago-checkout";
import type { SubscriptionStatus } from "@/modules/plans/entitlements";

export const dynamic = "force-dynamic";
export const metadata = { title: "Assinatura" };

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  PENDING: "Aguardando ativação",
  ACTIVE: "Ativa",
  PAST_DUE: "Em atraso",
  RESTRICTED: "Restrita",
  SUSPENDED: "Suspensa",
  CANCELLED: "Cancelada",
};

const INVOICE_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Rascunho",
  OPEN: "Aberta",
  PAID: "Paga",
  OVERDUE: "Vencida",
  VOID: "Cancelada",
  REFUNDED: "Estornada",
};

const INVOICE_KIND_LABEL: Record<string, string> = {
  INITIAL: "Primeira cobrança",
  RENEWAL: "Renovação",
  UPGRADE: "Upgrade de plano",
};

function formatDate(value: Date | string | null): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(`${value}T12:00:00Z`) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

function InvoiceStatus({ invoice }: { invoice: InvoiceRow }) {
  const style =
    invoice.status === "PAID"
      ? "bg-emerald-50 text-emerald-700"
      : invoice.status === "OVERDUE"
        ? "bg-red-50 text-red-700"
        : invoice.status === "REFUNDED" || invoice.status === "VOID"
          ? "bg-neutral-100 text-neutral-600"
          : "bg-amber-50 text-amber-700";

  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${style}`}>
      {INVOICE_STATUS_LABEL[invoice.status] ?? invoice.status}
    </span>
  );
}

export default async function AssinaturaPage() {
  let membership;
  try {
    membership = await requireTenant();
  } catch (error) {
    if (error instanceof AuthError) redirect("/login");
    throw error;
  }

  const [overview, invoices, refundRequests] = await Promise.all([
    getTenantOverview(membership.tenantId),
    listInvoices(membership.tenantId),
    listRefundRequests(membership.tenantId),
  ]);

  const upgradeOptions =
    overview?.subscription?.status === "ACTIVE"
      ? await listUpgradeOptions(membership.tenantId)
      : [];
  const remainingScheduled =
    overview?.subscription?.status === "ACTIVE"
      ? await pendingRemainingCents(membership.tenantId)
      : 0;
  const publicPlans =
    overview?.subscription?.status !== "ACTIVE"
      ? await listPublicPlans().catch(() => [])
      : [];

  const refundedProcessed = refundRequests.find((r) => r.status === "PROCESSED");

  if (!overview) {
    return (
      <p className="rounded-xl border border-border bg-surface p-6 text-sm text-ink-muted">
        Estabelecimento não encontrado.
      </p>
    );
  }

  const subscription = overview.subscription;
  const configured = isGatewayConfigured();
  const today = todayIso();
  const openInvoice = invoices.find((invoice) =>
    ["DRAFT", "OPEN", "OVERDUE"].includes(invoice.status),
  );

  const canStartCheckout =
    !openInvoice &&
    subscription !== null &&
    (subscription.status !== "ACTIVE" ||
      (subscription.nextDueDate !== null && subscription.nextDueDate <= today));

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">Financeiro</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink">Assinatura e cobrança</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          A assinatura só fica ativa depois que o pagamento é confirmado pelo gateway, pelo
          webhook ou pela conciliação. Nenhum status bloqueia a consulta ou a exportação dos
          seus dados.
        </p>
      </div>

      {!configured ? (
        <div
          role="status"
          className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
        >
          O gateway de pagamento não está configurado nesta instalação. Enquanto isso, é
          possível consultar faturas, mas não gerar cobranças. Configure{" "}
          <code>MP_ACCESS_TOKEN</code> e <code>MP_WEBHOOK_SECRET</code> (sandbox/produção)
          para ativar o checkout.
        </div>
      ) : null}

      {!subscription ? (
        refundedProcessed ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-900">
            Seu acesso foi suspenso devido ao reembolso concluído. Os seus dados permanecem
            disponíveis para consulta e exportação.
          </div>
        ) : (
          <div className="space-y-4">
            <p className="rounded-xl border border-border bg-surface p-6 text-sm text-ink-muted">
              Nenhuma assinatura ativa encontrada. Escolha um plano abaixo para assinar ou fale
              com o suporte.
            </p>
            {publicPlans.length > 0 ? (
              <section className="rounded-2xl border border-border bg-surface p-6">
                <h2 className="text-lg font-semibold">Planos disponíveis</h2>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  {publicPlans.map((plan) => (
                    <div key={plan.code} className="rounded-xl border border-border p-4">
                      <p className="font-semibold">{plan.name}</p>
                      <p className="text-sm text-ink-muted">{formatBRL(plan.priceCents)}/mês</p>
                      <p className="mt-1 text-xs text-ink-muted">
                        Primeiro pagamento: {formatBRL(plan.priceCents + plan.activationFeeCents)}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        )
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-surface p-5">
              <p className="text-xs uppercase tracking-wide text-ink-muted">Plano</p>
              <p className="mt-1 text-lg font-semibold">{overview.entitlements?.plan.name}</p>
              <p className="text-sm text-ink-muted">
                {formatBRL(subscription.priceCents)}/mês
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                Ativação contratada: {formatBRL(subscription.activationFeeCents)}
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-surface p-5">
              <p className="text-xs uppercase tracking-wide text-ink-muted">Situação</p>
              <p className="mt-1 text-lg font-semibold">{STATUS_LABEL[subscription.status]}</p>
              <p className="mt-1 text-sm text-ink-muted">
                {subscription.nextDueDate
                  ? `Próximo vencimento: ${formatDate(subscription.nextDueDate)}`
                  : "Primeiro pagamento pendente"}
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-surface p-5">
              <p className="text-xs uppercase tracking-wide text-ink-muted">Acesso aos dados</p>
              <p className="mt-1 text-sm">
                Consulta:{" "}
                <strong>
                  {overview.entitlements?.access.canReadOwnData ? "liberada" : "bloqueada"}
                </strong>
              </p>
              <p className="text-sm">
                Exportação:{" "}
                <strong>
                  {overview.entitlements?.access.canExportData ? "liberada" : "bloqueada"}
                </strong>
              </p>
              <p className="text-sm">
                Pagamento:{" "}
                <strong>{overview.entitlements?.access.canPay ? "liberado" : "indisponível"}</strong>
              </p>
            </div>
          </section>

          {openInvoice ? (
            <section className="rounded-2xl border border-border bg-surface p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">
                    {INVOICE_KIND_LABEL[openInvoice.kind] ?? openInvoice.kind}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold">
                    Fatura de {formatBRL(openInvoice.totalCents)}
                  </h2>
                  <p className="text-sm text-ink-muted">
                    Vencimento: {formatDate(openInvoice.dueDate)}
                  </p>
                </div>
                <InvoiceStatus invoice={openInvoice} />
              </div>

              <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <div className="flex justify-between gap-4 border-b border-border py-2">
                  <dt className="text-ink-muted">Mensalidade</dt>
                  <dd>{formatBRL(openInvoice.planAmountCents)}</dd>
                </div>
                <div className="flex justify-between gap-4 border-b border-border py-2">
                  <dt className="text-ink-muted">Ativação</dt>
                  <dd>{formatBRL(openInvoice.activationAmountCents)}</dd>
                </div>
                {openInvoice.discountCents > 0 ? (
                  <div className="flex justify-between gap-4 border-b border-border py-2">
                    <dt className="text-ink-muted">Desconto</dt>
                    <dd>-{formatBRL(openInvoice.discountCents)}</dd>
                  </div>
                ) : null}
                {openInvoice.fineCents > 0 ? (
                  <div className="flex justify-between gap-4 border-b border-border py-2">
                    <dt className="text-ink-muted">Multa por atraso</dt>
                    <dd>{formatBRL(openInvoice.fineCents)}</dd>
                  </div>
                ) : null}
                {openInvoice.interestCents > 0 ? (
                  <div className="flex justify-between gap-4 border-b border-border py-2">
                    <dt className="text-ink-muted">Juros pro rata die</dt>
                    <dd>{formatBRL(openInvoice.interestCents)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-4 py-2 font-medium">
                  <dt>Total</dt>
                  <dd>{formatBRL(openInvoice.totalCents)}</dd>
                </div>
              </dl>

              {openInvoice.pixPayload ? (
                <div className="mt-5 space-y-3">
                  <p className="text-sm font-medium">Pix copia e cola</p>
                  <textarea
                    readOnly
                    value={openInvoice.pixPayload}
                    rows={4}
                    className="w-full rounded-lg border border-border bg-surface-sunken p-3 font-mono text-xs"
                  />
                  <p className="text-xs text-ink-muted">
                    {openInvoice.pixExpiresAt
                      ? `O código expira em ${formatDate(openInvoice.pixExpiresAt)}.`
                      : "Pague pelo aplicativo do seu banco e depois consulte a confirmação."}
                    {openInvoice.pixExpiresAt
                      ? " Depois disso, gere uma nova cobrança se necessário."
                      : null}
                  </p>
                  {openInvoice.invoiceUrl ? (
                    <Link
                      href={openInvoice.invoiceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block text-sm font-medium text-brand-700 underline"
                    >
                      Abrir fatura no gateway
                    </Link>
                  ) : null}
                  <div className="mt-5 border-t border-border pt-5">
                    <p className="mb-3 text-sm font-medium">Pagar com cartão</p>
                    <MercadoPagoCheckout
                      invoiceId={openInvoice.id}
                      amountCents={openInvoice.totalCents}
                      payerEmail={undefined}
                    />
                  </div>
                  <ReconcileForm invoiceId={openInvoice.id} />
                  <div className="mt-3">
                    <CancelChargeForm invoiceId={openInvoice.id} />
                  </div>
                </div>
              ) : configured ? (
                <div className="mt-5 space-y-3">
                  <ChargeForm invoiceId={openInvoice.id} />
                  <CancelChargeForm invoiceId={openInvoice.id} />
                </div>
              ) : null}
            </section>
          ) : configured && canStartCheckout ? (
            <section className="rounded-2xl border border-border bg-surface p-6">
              <h2 className="text-lg font-semibold">Gerar cobrança Pix</h2>
              <p className="mt-1 max-w-2xl text-sm text-ink-muted">
                A fatura discrimina mensalidade e ativação. A assinatura só é ativada quando o
                pagamento for confirmado.
              </p>
              <div className="mt-4 max-w-md">
                <CheckoutForm />
              </div>
            </section>
          ) : subscription.status === "ACTIVE" ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              Nenhuma cobrança em aberto. Próximo vencimento:{" "}
              {formatDate(subscription.nextDueDate)}.
            </p>
          ) : null}

          {publicPlans.length > 0 ? (
            <section className="rounded-2xl border border-border bg-surface p-6">
              <h2 className="text-lg font-semibold">Planos disponíveis</h2>
              <p className="mt-1 text-sm text-ink-muted">
                Escolha o plano ideal para o seu estabelecimento. A assinatura é ativada após a confirmação do pagamento.
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                {publicPlans.map((plan) => (
                  <div key={plan.code} className="rounded-xl border border-border p-4">
                    <p className="font-semibold">{plan.name}</p>
                    <p className="text-sm text-ink-muted">{formatBRL(plan.priceCents)}/mês</p>
                    <p className="mt-1 text-xs text-ink-muted">
                      Primeiro pagamento: {formatBRL(plan.priceCents + plan.activationFeeCents)}
                    </p>
                    <div className="mt-3">
                      <SubscribePlanForm planId={plan.id} label={`Assinar ${plan.name}`} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {upgradeOptions.length > 0 ? (
            <section className="rounded-2xl border border-border bg-surface p-6">
              <h2 className="text-lg font-semibold">Upgrade de plano</h2>
              <p className="mt-1 text-sm text-ink-muted">
                Evolua sua assinatura com 25% de desconto: pague 50% agora e 50% na próxima mensalidade.
                {remainingScheduled > 0 ? (
                  <span className="ml-1">
                    Próxima mensalidade incluirá {formatBRL(remainingScheduled)} de upgrade.
                  </span>
                ) : null}
              </p>
              <div className="mt-4 space-y-4">
                {upgradeOptions.map((opt) => (
                  <div key={opt.plan.id} className="rounded-xl border border-border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{opt.plan.name}</p>
                        <p className="text-sm text-ink-muted">{formatBRL(opt.plan.priceCents)}/mês</p>
                      </div>
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                        25% de desconto
                      </span>
                    </div>
                    <dl className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
                      <div className="flex justify-between gap-4 border-b border-border py-1">
                        <dt className="text-ink-muted">Preço original</dt>
                        <dd>{formatBRL(opt.quote.originalAmountCents)}</dd>
                      </div>
                      <div className="flex justify-between gap-4 border-b border-border py-1">
                        <dt className="text-ink-muted">Desconto 25%</dt>
                        <dd>-{formatBRL(opt.quote.discountAmountCents)}</dd>
                      </div>
                      <div className="flex justify-between gap-4 border-b border-border py-1">
                        <dt className="text-ink-muted">Preço final</dt>
                        <dd>{formatBRL(opt.quote.finalAmountCents)}</dd>
                      </div>
                      <div className="flex justify-between gap-4 border-b border-border py-1">
                        <dt className="text-ink-muted">Entrada (50%)</dt>
                        <dd>{formatBRL(opt.quote.entryAmountCents)}</dd>
                      </div>
                      <div className="flex justify-between gap-4 py-1">
                        <dt className="text-ink-muted">Restante (próxima mensalidade)</dt>
                        <dd>{formatBRL(opt.quote.remainingAmountCents)}</dd>
                      </div>
                    </dl>
                    <div className="mt-3 max-w-xs">
                      <UpgradeForm toPlanId={opt.plan.id} label="Contratar upgrade" />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="rounded-2xl border border-border bg-surface p-6">
            <h2 className="text-lg font-semibold">Minha assinatura</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Gerencie o cancelamento e solicite reembolso dentro do prazo de 7 dias após o
              pagamento.
            </p>
            <div className="mt-4 grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold">Cancelar assinatura</h3>
                <p className="mt-1 text-xs text-ink-muted">
                  O cancelamento encerra a assinatura e impede cobranças futuras.
                </p>
                <div className="mt-3">
                  <RequestCancellationForm />
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold">Solicitar reembolso</h3>
                <p className="mt-1 text-xs text-ink-muted">
                  Disponível nos primeiros 7 dias corridos após a confirmação do pagamento.
                  O reembolso só é efetivado após confirmação do gateway.
                </p>
                {openInvoice ? (
                  <div className="mt-3 text-xs text-ink-muted">
                    Reembolso disponível após a fatura ser paga.
                  </div>
                ) : invoices.some((i) => i.status === "PAID") ? (
                  <div className="mt-3 space-y-2">
                    {invoices
                      .filter((i) => i.status === "PAID")
                      .slice(0, 3)
                      .map((inv) => (
                        <div key={inv.id} className="rounded-lg border border-border p-3">
                          <p className="text-xs text-ink-muted">
                            Fatura {inv.kind === "INITIAL" ? "inicial" : "renovação"} —{" "}
                            {formatBRL(inv.totalCents)} (paga em {formatDate(inv.paidAt)})
                          </p>
                          <div className="mt-2">
                            <RequestRefundForm invoiceId={inv.id} />
                          </div>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-ink-muted">
                    Nenhuma fatura paga encontrada para reembolso.
                  </p>
                )}
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Histórico de faturas</h2>
            {invoices.length === 0 ? (
              <p className="mt-3 rounded-xl border border-border bg-surface p-6 text-sm text-ink-muted">
                Nenhuma fatura emitida ainda.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                      <th className="py-3 pr-4 font-medium">Tipo</th>
                      <th className="py-3 pr-4 font-medium">Valor</th>
                      <th className="py-3 pr-4 font-medium">Vencimento</th>
                      <th className="py-3 pr-4 font-medium">Situação</th>
                      <th className="py-3 pr-4 font-medium">Pago em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((invoice) => (
                      <tr key={invoice.id} className="border-b border-border">
                        <td className="py-3 pr-4">
                          {INVOICE_KIND_LABEL[invoice.kind] ?? invoice.kind}
                        </td>
                        <td className="py-3 pr-4">{formatBRL(invoice.totalCents)}</td>
                        <td className="py-3 pr-4">{formatDate(invoice.dueDate)}</td>
                        <td className="py-3 pr-4">
                          <InvoiceStatus invoice={invoice} />
                        </td>
                        <td className="py-3 pr-4">{formatDate(invoice.paidAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      <p className="text-xs text-ink-muted">
        Tem um cupom ou chave secreta?{" "}
        <Link href="/resgatar-codigo" className="underline">
          Resgatar código
        </Link>
        . Precisa de ajuda com a cobrança?{" "}
        <Link href="/dashboard" className="underline">
          Voltar ao painel
        </Link>
        .
      </p>
    </div>
  );
}
