import Link from "next/link";
import { redirect } from "next/navigation";
import { logoutAction } from "@/modules/auth/actions";
import { AuthError, requireTenant } from "@/lib/auth";
import { getTenantBasic, loadEntitlements } from "@/modules/billing/queries";
import { listMyMemberships } from "@/modules/tenants/queries";
import { TenantSwitcher } from "@/components/app/tenant-switcher";
import { NavLink } from "@/components/app/nav-link";
import { listIngredients } from "@/modules/inventory/queries";
import { listInvoices } from "@/modules/billing/service";
import { hasFeature } from "@/modules/plans/entitlements";
import { isLowStock } from "@/modules/inventory/rules";

export const dynamic = "force-dynamic";

type NavItem = {
  href: string;
  label: string;
  group: "operation" | "business";
  badge?: number;
  icon: React.ReactNode;
};

function Icon({ path, className = "h-5 w-5" }: { path: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

const ICONS = {
  overview: "M4 5.5h7v7H4zM13 5.5h7v7h-7zM4 14.5h7v5H4zM13 14.5h7v5h-7z",
  catalog: "M4 7h16M4 12h16M4 17h10",
  stock: "M4 7l8-4 8 4-8 4-8-4zM4 12l8 4 8-4M4 17l8 4 8-4",
  production: "M5 19V9l7-4 7 4v10M9 19v-5h6v5",
  team: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM17 13a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM3 20c0-3 2.7-5 6-5s6 2 6 5M14 20c0-2 1.7-3.5 4-3.5s3 1.5 3 3.5",
  subscription: "M3 7h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7zM3 10h18",
  data: "M5 4h14v16H5zM9 8h6M9 12h6M9 16h4",
  settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  logout: "M15 12H3M15 12l-4-4M15 12l-4 4M10 5V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-1",
  bell: "M12 4a5 5 0 0 0-5 5v2.5L5 14h14l-2-2.5V9a5 5 0 0 0-5-5zM9.5 17a2.5 2.5 0 0 0 5 0",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20c0-3.3 3.6-6 8-6s8 2.7 8 6",
  chevron: "M9 6l6 6-6 6",
};

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
  const entitlements = loaded?.entitlements ?? null;

  const roleLabel =
    membership.role === "OWNER"
      ? "Proprietário"
      : membership.role === "MANAGER"
        ? "Gerente"
        : "Equipe";

  let lowStockCount = 0;
  let openInvoicesCount = 0;
  if (entitlements && hasFeature(entitlements, "stock.basic")) {
    try {
      const ingredients = await listIngredients(membership.tenantId);
      lowStockCount = ingredients.filter((ingredient) =>
        isLowStock({ quantity: ingredient.quantity, minStock: ingredient.minStock }),
      ).length;
    } catch {
      lowStockCount = 0;
    }
  }
  try {
    const invoices = await listInvoices(membership.tenantId);
    openInvoicesCount = invoices.filter((invoice) =>
      ["DRAFT", "OPEN", "OVERDUE"].includes(invoice.status),
    ).length;
  } catch {
    openInvoicesCount = 0;
  }
  const notificationCount = lowStockCount + openInvoicesCount;

  const navItems: NavItem[] = [
    { href: "/dashboard", label: "Visão geral", group: "operation", icon: <Icon path={ICONS.overview} /> },
    { href: "/catalogo", label: "Catálogo", group: "operation", icon: <Icon path={ICONS.catalog} /> },
    { href: "/estoque", label: "Estoque", group: "operation", badge: lowStockCount > 0 ? lowStockCount : undefined, icon: <Icon path={ICONS.stock} /> },
    { href: "/producao", label: "Produção", group: "operation", icon: <Icon path={ICONS.production} /> },
    { href: "/equipe", label: "Equipe", group: "operation", icon: <Icon path={ICONS.team} /> },
    { href: "/assinatura", label: "Assinatura", group: "business", badge: openInvoicesCount > 0 ? openInvoicesCount : undefined, icon: <Icon path={ICONS.subscription} /> },
    { href: "/dados", label: "Dados", group: "business", icon: <Icon path={ICONS.data} /> },
    { href: "/configuracoes", label: "Configurações", group: "business", icon: <Icon path={ICONS.settings} /> },
  ];

  const operationItems = navItems.filter((item) => item.group === "operation");
  const businessItems = navItems.filter((item) => item.group === "business");

  function NavList({ items }: { items: NavItem[] }) {
    return (
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li key={item.href + item.label}>
            <NavLink
              href={item.href}
              className="group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/65 transition-all duration-150 hover:bg-white/[0.06] hover:text-white"
              activeClassName="bg-white/[0.10] text-white before:absolute before:left-0 before:top-1/2 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-brand-400 before:content-['']"
            >
              <span className="text-white/45 transition group-hover:text-white/80">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {item.badge ? (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-semibold text-white">
                  {item.badge}
                </span>
              ) : null}
            </NavLink>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="min-h-screen bg-surface-soft text-ink">
      {/* Mobile header */}
      <header className="sticky top-0 z-40 border-b border-border bg-white/90 backdrop-blur-xl md:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-bold text-white shadow-sm">
              G
            </span>
            <span className="font-display text-base font-semibold tracking-tight text-ink">Gestão</span>
          </Link>
          <div className="flex items-center gap-2">
            {notificationCount > 0 ? (
              <Link
                href={lowStockCount > 0 ? "/estoque" : "/assinatura"}
                className="relative rounded-full bg-amber-50 p-2 text-amber-700"
                aria-label={`${notificationCount} notificações`}
              >
                <Icon path={ICONS.bell} className="h-4 w-4" />
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {notificationCount}
                </span>
              </Link>
            ) : null}
            <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">{roleLabel}</span>
            <form action={logoutAction}>
              <button type="submit" className="text-xs font-medium text-ink-muted hover:text-brand-700">
                Sair
              </button>
            </form>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-border px-2 py-2">
          {navItems.map((item) => (
            <Link
              key={item.href + item.label}
              href={item.href}
              className="flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium text-ink-muted transition hover:bg-brand-50 hover:text-brand-700"
            >
              {item.icon}
              {item.label}
              {item.badge ? (
                <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {item.badge}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>
      </header>

      <div className="md:grid md:min-h-screen md:grid-cols-[264px_1fr]">
        {/* Sidebar */}
        <aside className="hidden border-r border-navy-line bg-navy text-white md:sticky md:top-0 md:flex md:h-screen md:flex-col">
          {/* Brand */}
          <div className="flex items-center gap-3 px-5 py-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white shadow-lg shadow-brand-900/40">
              G
            </span>
            <div className="min-w-0">
              <p className="truncate font-display text-[15px] font-semibold tracking-tight text-white">
                Gestão Padarias
              </p>
              <p className="truncate text-[11px] text-white/45">Painel do estabelecimento</p>
            </div>
          </div>

          {/* Establishment card */}
          <div className="px-4 pb-3">
            <div className="rounded-xl bg-white/[0.05] p-3.5 ring-1 ring-white/[0.08]">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500/30 to-brand-700/30 text-sm font-bold text-brand-100 ring-1 ring-white/10">
                  {(tenant?.tradeName ?? "E").charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">
                    {tenant?.tradeName ?? "Estabelecimento"}
                  </p>
                  <p className="truncate text-[11px] text-white/45">{tenant?.slug ?? "sem-slug"}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="rounded-md bg-brand-500/15 px-2 py-0.5 text-[11px] font-medium text-brand-200">
                  {roleLabel}
                </span>
                {notificationCount > 0 ? (
                  <Link
                    href={lowStockCount > 0 ? "/estoque" : "/assinatura"}
                    className="relative rounded-md bg-white/[0.06] p-1.5 text-white/70 transition hover:bg-white/[0.10] hover:text-white"
                    aria-label={`${notificationCount} notificações`}
                  >
                    <Icon path={ICONS.bell} className="h-4 w-4" />
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                      {notificationCount}
                    </span>
                  </Link>
                ) : (
                  <span className="text-[11px] text-white/35">Sem alertas</span>
                )}
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto px-3 py-2">
            <div className="space-y-5">
              <section>
                <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/30">
                  Operação
                </p>
                <NavList items={operationItems} />
              </section>
              <section>
                <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/30">
                  Negócio
                </p>
                <NavList items={businessItems} />
              </section>
            </div>
          </nav>

          {/* Footer */}
          <div className="space-y-3 border-t border-navy-line px-4 py-4">
            <TenantSwitcher
              options={myTenants.map((item) => ({
                tenantId: item.tenantId,
                tradeName: item.tradeName,
              }))}
              currentTenantId={membership.tenantId}
            />
            <div className="flex items-center gap-3 rounded-xl bg-white/[0.05] px-3 py-2.5 ring-1 ring-white/[0.08]">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500/20 text-brand-100">
                <Icon path={ICONS.user} className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{membership.name}</p>
                <p className="truncate text-[11px] text-white/45">{membership.email}</p>
              </div>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/[0.10] bg-white/[0.04] px-3 py-2.5 text-sm font-medium text-white/75 transition hover:bg-white/[0.09] hover:text-white"
              >
                <Icon path={ICONS.logout} className="h-4 w-4" />
                Sair da conta
              </button>
            </form>
          </div>
        </aside>

        <div className="min-w-0">
          {warning ? (
            <div
              role="status"
              className={`border-b ${blocked ? "border-red-200 bg-red-50 text-red-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 text-sm">
                <span>{warning}</span>
                <Link href="/assinatura" className="font-medium underline">
                  Ver assinatura
                </Link>
              </div>
            </div>
          ) : null}

          <main className="mx-auto w-full max-w-[1400px] px-6 py-6 md:px-8 md:py-8 animate-fade-up">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}