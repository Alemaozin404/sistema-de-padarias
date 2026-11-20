import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthError, requireTenant } from "@/lib/auth";
import { getTenantBasic, loadEntitlements } from "@/modules/billing/queries";
import { listMyMemberships } from "@/modules/tenants/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configurações" };

export default async function ConfiguracoesPage() {
  let membership;
  try {
    membership = await requireTenant();
  } catch (error) {
    if (error instanceof AuthError) redirect("/login");
    throw error;
  }

  const [tenant, loaded, myTenants] = await Promise.all([
    getTenantBasic(membership.tenantId),
    loadEntitlements(membership.tenantId).catch(() => null),
    listMyMemberships(membership.userId).catch(() => []),
  ]);

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-600">Configurações</p>
        <h1 className="mt-1.5 font-display text-2xl font-bold tracking-tight text-ink">Preferências do estabelecimento</h1>
        <p className="mt-1.5 text-sm text-ink-muted">
          Gerencie identidade, acesso e preferências da sua padaria.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">Estabelecimento</p>
          <p className="mt-2 font-display text-lg font-bold text-ink">{tenant?.tradeName ?? "—"}</p>
          <p className="text-sm text-ink-muted">{tenant?.slug ?? "—"}</p>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-4 border-b border-border py-2">
              <span className="text-ink-muted">Seu perfil</span>
              <span className="font-medium">
                {membership.role === "OWNER" ? "Proprietário" : membership.role === "MANAGER" ? "Gerente" : "Equipe"}
              </span>
            </div>
            <div className="flex justify-between gap-4 border-b border-border py-2">
              <span className="text-ink-muted">Plano</span>
              <span className="font-medium">{loaded?.entitlements.plan.name ?? "—"}</span>
            </div>
            <div className="flex justify-between gap-4 py-2">
              <span className="text-ink-muted">Status da assinatura</span>
              <span className="font-medium">{loaded?.entitlements.status ?? "—"}</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">Atalhos</p>
          <div className="mt-3 grid gap-2">
            {[
              { href: "/assinatura", label: "Gerenciar assinatura e cobrança" },
              { href: "/equipe", label: "Gerenciar equipe e acessos" },
              { href: "/dados", label: "Exportar e consultar dados" },
              { href: "/dashboard", label: "Voltar ao painel" },
            ].map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="flex items-center justify-between rounded-xl border border-border bg-surface-soft px-4 py-3 text-sm font-medium text-ink transition hover:border-brand-300 hover:text-brand-700"
              >
                {a.label}
                <span className="text-ink-faint">→</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {myTenants.length > 1 ? (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">Estabelecimentos vinculados</p>
          <p className="mt-1 text-sm text-ink-muted">
            Você tem acesso a {myTenants.length} estabelecimentos. Troque pelo seletor na barra lateral.
          </p>
        </section>
      ) : null}
    </div>
  );
}