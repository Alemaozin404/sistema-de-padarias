import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthError, requireTenant } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Seus dados" };

export default async function DadosPage() {
  let membership;
  try {
    membership = await requireTenant();
  } catch (error) {
    if (error instanceof AuthError) redirect("/login");
    throw error;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">
          Privacidade
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink">Seus dados</h1>
        <p className="mt-2 text-sm text-ink-muted">
          O estabelecimento pode exportar todos os dados vinculados à sua conta em um único
          arquivo, a qualquer momento — inclusive em situação de atraso, suspensão ou
          encerramento. A exportação fica registrada em auditoria.
        </p>
      </div>

      <section className="space-y-3 rounded-2xl border border-border bg-surface p-6">
        <h2 className="text-base font-semibold">Exportação completa</h2>
        <p className="text-sm text-ink-muted">
          O arquivo inclui estabelecimento, equipe, catálogo, estoque, produção, assinatura,
          faturas, pagamentos, descontos, notificações e auditoria.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/api/lgpd/export?format=json"
            className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            Baixar JSON
          </Link>
          <Link
            href="/api/lgpd/export?format=csv"
            className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:border-brand-600"
          >
            Baixar CSV
          </Link>
        </div>
        <p className="text-xs text-ink-muted">
          O CSV usa uma coluna <code>dados</code> com o registro em JSON, o que preserva toda
          a estrutura em um único arquivo.
        </p>
      </section>

      <p className="text-xs text-ink-muted">
        Usuário: {membership.role} · Estabelecimento ativo: {membership.tenantId}
      </p>
    </div>
  );
}
