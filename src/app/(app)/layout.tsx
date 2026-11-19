import Link from "next/link";
import { redirect } from "next/navigation";
import { logoutAction } from "@/modules/auth/actions";
import { AuthError, requireTenant } from "@/lib/auth";
import { getTenantBasic, loadEntitlements } from "@/modules/billing/queries";
import { listMyMemberships } from "@/modules/tenants/queries";
import { TenantSwitcher } from "@/components/app/tenant-switcher";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let membership;
  let tenant;

  try {
    membership = await requireTenant();
    tenant = await getTenantBasic(membership.tenantId);
  } catch (error) {
    if (error instanceof AuthError) redirect("/login");
    throw error;
  }

  const myTenants = await listMyMemberships(membership.userId).catch(() => []);
  const loaded = await loadEntitlements(membership.tenantId).catch(() => null);
  const warning = loaded?.entitlements.warning ?? null;
  const blocked = loaded?.entitlements.status === "SUSPENDED";

  return (
    <div className="min-h-screen">
      <header className="border-b border-black/5">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-6">
            <span className="text-sm font-semibold tracking-tight">Gestão para padarias</span>
            <nav className="flex gap-4 text-sm">
              <Link href="/dashboard" className="text-ink-muted hover:text-brand-700">
                Painel
              </Link>
              <Link href="/catalogo" className="text-ink-muted hover:text-brand-700">
                Catálogo
              </Link>
              <Link href="/estoque" className="text-ink-muted hover:text-brand-700">
                Estoque
              </Link>
              <Link href="/producao" className="text-ink-muted hover:text-brand-700">
                Produção
              </Link>
              <Link href="/equipe" className="text-ink-muted hover:text-brand-700">
                Equipe
              </Link>
              <Link href="/assinatura" className="text-ink-muted hover:text-brand-700">
                Assinatura
              </Link>
              <Link href="/dados" className="text-ink-muted hover:text-brand-700">
                Dados
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <TenantSwitcher
              options={myTenants.map((item) => ({
                tenantId: item.tenantId,
                tradeName: item.tradeName,
              }))}
              currentTenantId={membership.tenantId}
            />
            <span className="text-ink-muted">{tenant?.tradeName ?? "Estabelecimento"}</span>
            <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
              {membership.role === "OWNER"
                ? "Proprietário"
                : membership.role === "MANAGER"
                  ? "Gerente"
                  : "Equipe"}
            </span>
            <form action={logoutAction}>
              <button type="submit" className="text-ink-muted hover:text-brand-700">
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>

      {warning ? (
        <div
          role="status"
          className={`border-b ${
            blocked
              ? "border-red-200 bg-red-50 text-red-900"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3 text-sm">
            <span>{warning}</span>
            <Link href="/assinatura" className="font-medium underline">
              Ver assinatura
            </Link>
          </div>
        </div>
      ) : null}

      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}
