import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlatformClientDetail, getTenantUsageSummary } from "@/modules/platform/queries";
import { withPlatformAdmin } from "@/lib/db";
import { getPlatformSession } from "@/lib/platform-auth";
import { listAuditLogs } from "@/modules/platform/queries";
import { formatBRL } from "@/modules/shared/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visualizar cliente" };

export default async function PlatformClientViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getPlatformSession();
  if (!session) notFound();
  const [detail, usage, logs] = await Promise.all([
    getPlatformClientDetail(id),
    getTenantUsageSummary(id),
    withPlatformAdmin(session.userId, (tx) => listAuditLogs(tx, { tenantId: id, limit: 50 })),
  ]);
  if (!detail) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/clientes/${id}`} className="text-sm text-ink-muted hover:text-brand-700">
          ← Voltar ao cliente
        </Link>
        <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-ink">Visualização: {detail.tenant.tradeName}</h1>
        <p className="text-sm text-ink-muted">Modo consulta. Todas as ações administrativas são auditadas.</p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-white p-5">
          <p className="text-xs uppercase tracking-wider text-ink-muted">Produtos</p>
          <p className="mt-2 text-2xl font-semibold">{usage.productCount}</p>
        </div>
        <div className="rounded-xl border border-border bg-white p-5">
          <p className="text-xs uppercase tracking-wider text-ink-muted">Assinatura</p>
          <p className="mt-2 text-lg font-semibold">{detail.current?.status ?? "—"}</p>
        </div>
        <div className="rounded-xl border border-border bg-white p-5">
          <p className="text-xs uppercase tracking-wider text-ink-muted">Mensalidade</p>
          <p className="mt-2 text-lg font-semibold">{formatBRL(detail.current?.priceCents ?? 0)}</p>
        </div>
        <div className="rounded-xl border border-border bg-white p-5">
          <p className="text-xs uppercase tracking-wider text-ink-muted">Faturas recentes</p>
          <p className="mt-2 text-lg font-semibold">{detail.invoices.length}</p>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-white p-5">
        <h2 className="text-sm font-semibold">Atividades recentes do cliente</h2>
        {logs.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">Nenhum evento.</p>
        ) : (
          <ul className="mt-3 divide-y divide-black/5 text-xs">
            {logs.map((log) => (
              <li key={log.id} className="py-2">
                <p className="font-medium">{log.action}</p>
                <p className="text-ink-muted">{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(log.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
