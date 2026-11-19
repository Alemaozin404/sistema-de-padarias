import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthError, requireTenant } from "@/lib/auth";
import { getTenantOverview } from "@/modules/billing/queries";
import { listInvoices, type InvoiceRow } from "@/modules/billing/service";
import { isGatewayConfigured } from "@/modules/billing/gateway";
import { todayIso } from "@/modules/billing/rules";
import { formatBRL } from "@/modules/shared/money";
import { ChargeForm, CheckoutForm, ReconcileForm } from "@/components/billing/billing-forms";
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

  const [overview, invoices] = await Promise.all([
    getTenantOverview(membership.tenantId),
    listInvoices(membership.tenantId),
  ]);

  if (!overview) {
    return (
      <p className="rounded-lg border border-black/10 p-6 text-sm text-ink-muted">
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
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Assinatura e cobrança</h1>
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
          <code>ASAAS_API_KEY</code>, <code>ASAAS_WEBHOOK_TOKEN</code> e{" "}
          <code>ASAAS_BASE_URL</code> (sandbox) para ativar o checkout.
        </div>
      ) : null}

      {!subscription ? (
        <p className="rounded-lg border border-black/10 p-6 text-sm text-ink-muted">
          Nenhuma assinatura encontrada. Fale com o suporte.
        </p>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-black/10 p-5">
              <p className="text-xs uppercase tracking-wide text-ink-muted">Plano</p>
              <p className="mt-1 text-lg font-semibold">{overview.entitlements?.plan.name}</p>
              <p className="text-sm text-ink-muted">
                {formatBRL(subscription.priceCents)}/mês
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                Ativação contratada: {formatBRL(subscription.activationFeeCents)}
              </p>
            </div>

            <div className="rounded-xl border border-black/10 p-5">
              <p className="text-xs uppercase tracking-wide text-ink-muted">Situação</p>
              <p className="mt-1 text-lg font-semibold">{STATUS_LABEL[subscription.status]}</p>
              <p className="mt-1 text-sm text-ink-muted">
                {subscription.nextDueDate
                  ? `Próximo vencimento: ${formatDate(subscription.nextDueDate)}`
                  : "Primeiro pagamento pendente"}
              </p>
            </div>

            <div className="rounded-xl border border-black/10 p-5">
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
            <section className="rounded-xl border border-black/10 p-6">
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
                <div className="flex justify-between gap-4 border-b border-black/5 py-2">
                  <dt className="text-ink-muted">Mensalidade</dt>
                  <dd>{formatBRL(openInvoice.planAmountCents)}</dd>
                </div>
                <div className="flex justify-between gap-4 border-b border-black/5 py-2">
                  <dt className="text-ink-muted">Ativação</dt>
                  <dd>{formatBRL(openInvoice.activationAmountCents)}</dd>
                </div>
                {openInvoice.discountCents > 0 ? (
                  <div className="flex justify-between gap-4 border-b border-black/5 py-2">
                    <dt className="text-ink-muted">Desconto</dt>
                    <dd>-{formatBRL(openInvoice.discountCents)}</dd>
                  </div>
                ) : null}
                {openInvoice.fineCents > 0 ? (
                  <div className="flex justify-between gap-4 border-b border-black/5 py-2">
                    <dt className="text-ink-muted">Multa por atraso</dt>
                    <dd>{formatBRL(openInvoice.fineCents)}</dd>
                  </div>
                ) : null}
                {openInvoice.interestCents > 0 ? (
                  <div className="flex justify-between gap-4 border-b border-black/5 py-2">
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
                    className="w-full rounded-lg border border-black/15 bg-black/[0.02] p-3 font-mono text-xs"
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
                  <ReconcileForm invoiceId={openInvoice.id} />
                </div>
              ) : configured ? (
                <div className="mt-5">
                  <ChargeForm invoiceId={openInvoice.id} />
                </div>
              ) : null}
            </section>
          ) : configured && canStartCheckout ? (
            <section className="rounded-xl border border-black/10 p-6">
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

          <section>
            <h2 className="text-lg font-semibold">Histórico de faturas</h2>
            {invoices.length === 0 ? (
              <p className="mt-3 rounded-lg border border-black/10 p-6 text-sm text-ink-muted">
                Nenhuma fatura emitida ainda.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-black/10 text-left text-xs uppercase tracking-wide text-ink-muted">
                      <th className="py-3 pr-4 font-medium">Tipo</th>
                      <th className="py-3 pr-4 font-medium">Valor</th>
                      <th className="py-3 pr-4 font-medium">Vencimento</th>
                      <th className="py-3 pr-4 font-medium">Situação</th>
                      <th className="py-3 pr-4 font-medium">Pago em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((invoice) => (
                      <tr key={invoice.id} className="border-b border-black/5">
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
        Precisa de ajuda com a cobrança?{" "}
        <Link href="/dashboard" className="underline">
          Voltar ao painel
        </Link>
        .
      </p>
    </div>
  );
}
