import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthError, requireTenant } from "@/lib/auth";
import { getTenantOverview, type ResolvedFeature } from "@/modules/billing/queries";
import { describeFeature } from "@/modules/plans/queries";
import { formatBRL } from "@/modules/shared/money";
import { hasFeature, limitOf } from "@/modules/plans/entitlements";
import { countProducts, listProducts } from "@/modules/catalog/queries";
import { listIngredients } from "@/modules/inventory/queries";
import { isLowStock } from "@/modules/inventory/rules";
import { listRecipes, listBatches } from "@/modules/production/queries";
import { countSeatsUsed } from "@/modules/members/queries";
import { withTenant } from "@/lib/db";
import { auditLogs } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import type { SubscriptionStatus } from "@/modules/plans/entitlements";
import { loadEntitlements } from "@/modules/billing/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Painel" };

function featureLabel(feature: ResolvedFeature): string {
  return describeFeature({
    key: feature.key,
    name: feature.name,
    valueType: feature.valueType,
    unitLabel: feature.unitLabel,
    isEnabled: feature.isEnabled,
    limitValue: feature.limitValue,
  });
}

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  PENDING: "Aguardando ativação",
  ACTIVE: "Ativa",
  PAST_DUE: "Em atraso",
  RESTRICTED: "Restrita",
  SUSPENDED: "Suspensa",
  CANCELLED: "Cancelada",
};

const STATUS_STYLE: Record<SubscriptionStatus, string> = {
  PENDING: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  ACTIVE: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  PAST_DUE: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  RESTRICTED: "bg-orange-50 text-orange-700 ring-1 ring-orange-200",
  SUSPENDED: "bg-red-50 text-red-700 ring-1 ring-red-200",
  CANCELLED: "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200",
};

const ACTIVITY_LABELS: Record<string, string> = {
  "product.created": "Produto cadastrado",
  "product.updated": "Produto atualizado",
  "product.published": "Produto publicado na vitrine",
  "product.unpublished": "Produto removido da vitrine",
  "product.archived": "Produto arquivado",
  "category.created": "Categoria criada",
  "category.archived": "Categoria desativada",
  "ingredient.created": "Insumo cadastrado",
  "ingredient.updated": "Insumo atualizado",
  "ingredient.archived": "Insumo arquivado",
  "stock.movement": "Movimento de estoque registrado",
  "recipe.created": "Ficha técnica criada",
  "recipe.updated": "Ficha técnica atualizada",
  "recipe.item_added": "Insumo adicionado à ficha",
  "recipe.item_removed": "Insumo removido da ficha",
  "recipe.archived": "Ficha técnica arquivada",
  "production.planned": "Fornada planejada",
  "production.completed": "Fornada concluída",
  "production.cancelled": "Fornada cancelada",
  "member.invited": "Convite enviado",
  "member.invite_revoked": "Convite cancelado",
  "member.role_changed": "Perfil alterado",
  "member.disabled": "Acesso desativado",
  "member.joined": "Novo membro entrou",
  "invoice.created": "Fatura criada",
  "invoice.charge_created": "Cobrança gerada",
  "invoice.paid": "Pagamento confirmado",
  "invoice.cancelled": "Cobrança cancelada",
  "invoice.renewal_created": "Renovação criada",
};

function greetingForHour(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(value);
}

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
  products: "M4 7h16M4 12h16M4 17h10",
  published: "M5 12l5 5 9-10",
  alert: "M12 4l9 16H3L12 4zM12 9v4M12 16h.01",
  production: "M5 19V9l7-4 7 4v10M9 19v-5h6v5",
  team: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM17 13a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM3 20c0-3 2.7-5 6-5s6 2 6 5",
  subscription: "M3 7h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7zM3 10h18",
  plus: "M12 5v14M5 12h14",
  stock: "M4 7l8-4 8 4-8 4-8-4zM4 12l8 4 8-4",
  recipe: "M6 4h12v16H6zM9 8h6M9 12h6M9 16h4",
  teamAlt: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM17 13a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5",
  storefront: "M3 9l2-5h14l2 5M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M9 20v-6h6v6",
  activity: "M4 12h4l2-5 4 10 2-5h4",
  usage: "M4 19h16M6 16V9M12 16V5M18 16v-7",
  bell: "M12 4a5 5 0 0 0-5 5v2.5L5 14h14l-2-2.5V9a5 5 0 0 0-5-5zM9.5 17a2.5 2.5 0 0 0 5 0",
  arrow: "M5 12h14M13 6l6 6-6 6",
};

function MetricCard({
  label,
  value,
  hint,
  icon,
  tone = "brand",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
  tone?: "brand" | "amber" | "emerald" | "red";
}) {
  const toneClass =
    tone === "amber"
      ? "bg-amber-50 text-amber-600"
      : tone === "emerald"
        ? "bg-emerald-50 text-emerald-600"
        : tone === "red"
          ? "bg-red-50 text-red-600"
          : "bg-brand-50 text-brand-600";

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-surface p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lg hover:shadow-brand-900/5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">{label}</p>
          <p className="mt-2 font-display text-3xl font-bold tracking-tight text-ink tabular-nums">{value}</p>
          {hint ? <p className="mt-1.5 text-xs text-ink-muted">{hint}</p> : null}
        </div>
        <span className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${toneClass} transition group-hover:scale-105`}>
          {icon}
        </span>
      </div>
    </div>
  );
}

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const percent = limit && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : null;
  const danger = percent !== null && percent >= 90;
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-white/90">{label}</span>
        <span className="text-white/60 tabular-nums">
          {used}
          {limit !== null ? ` de ${limit}` : " · sem limite"}
        </span>
      </div>
      {percent !== null ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full transition-all ${danger ? "bg-red-400" : "bg-gradient-to-r from-brand-300 to-brand-500"}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      ) : (
        <div className="mt-2 h-1.5 rounded-full bg-white/10" />
      )}
    </div>
  );
}

export default async function DashboardPage() {
  let membership;
  try {
    membership = await requireTenant();
  } catch (error) {
    if (error instanceof AuthError) redirect("/login");
    throw error;
  }

  const overview = await getTenantOverview(membership.tenantId);
  if (!overview) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-8 text-sm text-ink-muted">
        Estabelecimento não encontrado.
      </div>
    );
  }

  const entitlements = await loadEntitlements(membership.tenantId).catch(() => null).then((l) => l?.entitlements ?? overview.entitlements);
  const subscription = overview.subscription;

  const [totalProducts, productList, ingredients, recipes, batches, seats] = await Promise.all([
    countProducts(membership.tenantId),
    listProducts(membership.tenantId),
    listIngredients(membership.tenantId).catch(() => []),
    listRecipes(membership.tenantId).catch(() => []),
    listBatches(membership.tenantId).catch(() => []),
    countSeatsUsed(membership.tenantId).catch(() => 0),
  ]);

  const publishedProducts = productList.filter((product) => product.isAvailable).length;
  const lowStockCount = ingredients.filter((ingredient) =>
    isLowStock({ quantity: ingredient.quantity, minStock: ingredient.minStock }),
  ).length;

  const recentActivities = await withTenant(membership.tenantId, (tx) =>
    tx
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.tenantId, membership.tenantId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(8),
  ).catch(() => []);

  const productLimit = entitlements ? limitOf(entitlements, "products.max") : null;
  const userLimit = entitlements ? limitOf(entitlements, "users.max") : null;
  const hasStock = entitlements ? hasFeature(entitlements, "stock.basic") : false;
  const hasProduction = entitlements ? hasFeature(entitlements, "production.enabled") : false;

  const features = overview.features.filter((feature) => feature.isEnabled);

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-600">
            {greetingForHour()}, {membership.name.split(" ")[0]}
          </p>
          <h1 className="mt-1.5 font-display text-3xl font-bold tracking-tight text-ink md:text-4xl">
            {overview.tradeName}
          </h1>
          <p className="mt-1.5 text-sm text-ink-muted">{formatDate(new Date())}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
              entitlements?.warning
                ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${entitlements?.warning ? "bg-amber-500" : "bg-emerald-500"}`} />
            {entitlements?.warning ? "Atenção financeira" : "Operação em dia"}
          </span>
          <Link
            href="/catalogo"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-600/25 transition hover:bg-brand-700"
          >
            <Icon path={ICONS.plus} className="h-4 w-4" />
            Novo produto
          </Link>
          <Link
            href={`/${overview.slug}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-brand-300 hover:text-brand-700"
          >
            <Icon path={ICONS.storefront} className="h-4 w-4" />
            Abrir vitrine
          </Link>
        </div>
      </section>

      {entitlements?.warning ? (
        <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {entitlements.warning}
        </div>
      ) : null}

      {!subscription || !entitlements ? (
        <div className="rounded-2xl border border-border bg-surface p-8 text-sm text-ink-muted">
          Nenhuma assinatura encontrada para este estabelecimento. Fale com o suporte.
        </div>
      ) : (
        <>
          {/* Metric cards */}
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCard
              label="Produtos cadastrados"
              value={String(totalProducts)}
              hint={productLimit !== null ? `${productLimit} disponíveis no plano` : "Sem limite no plano"}
              icon={<Icon path={ICONS.products} />}
            />
            <MetricCard
              label="Produtos publicados"
              value={String(publishedProducts)}
              hint="Visíveis na vitrine pública"
              icon={<Icon path={ICONS.published} />}
              tone="emerald"
            />
            <MetricCard
              label="Itens com estoque baixo"
              value={String(lowStockCount)}
              hint={hasStock ? "Requer atenção" : "Disponível em planos superiores"}
              icon={<Icon path={ICONS.alert} />}
              tone={lowStockCount > 0 ? "red" : "emerald"}
            />
            <MetricCard
              label="Fichas técnicas"
              value={String(recipes.length)}
              hint={hasProduction ? `${batches.length} fornada(s) registrada(s)` : "Disponível no plano Empresarial"}
              icon={<Icon path={ICONS.recipe} />}
            />
            <MetricCard
              label="Funcionários"
              value={String(seats)}
              hint={userLimit !== null ? `${userLimit} assentos no plano` : "Sem limite no plano"}
              icon={<Icon path={ICONS.team} />}
            />
            <MetricCard
              label="Situação da assinatura"
              value={STATUS_LABEL[subscription.status]}
              hint={
                subscription.nextDueDate
                  ? `Próximo vencimento: ${subscription.nextDueDate}`
                  : "Primeiro pagamento pendente"
              }
              icon={<Icon path={ICONS.subscription} />}
              tone={
                subscription.status === "ACTIVE"
                  ? "emerald"
                  : subscription.status === "SUSPENDED" || subscription.status === "CANCELLED"
                    ? "red"
                    : "amber"
              }
            />
          </section>

          {/* Establishment vision + quick access */}
          <section className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
            {/* Dark hero card */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-navy via-navy-soft to-navy-muted p-6 text-white shadow-xl shadow-navy/20 md:p-8">
              <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-500/20 blur-3xl" />
              <div className="absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl" />

              <div className="relative">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-300">
                      Visão do estabelecimento
                    </p>
                    <h2 className="mt-1.5 font-display text-2xl font-bold tracking-tight md:text-3xl">
                      {overview.tradeName}
                    </h2>
                    <p className="mt-1 text-sm text-white/60">
                      {overview.slug} · {entitlements.plan.name} · {formatBRL(subscription.priceCents)}/mês
                    </p>
                  </div>
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLE[subscription.status]}`}
                  >
                    {STATUS_LABEL[subscription.status]}
                  </span>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/10">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50">
                      Próximo vencimento
                    </p>
                    <p className="mt-1.5 font-display text-lg font-semibold text-white">
                      {subscription.nextDueDate ?? "Primeiro pagamento pendente"}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/10">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50">
                      Recursos ativos
                    </p>
                    <p className="mt-1.5 font-display text-lg font-semibold text-white">{features.length}</p>
                  </div>
                </div>

                <div className="mt-6 space-y-4">
                  <UsageBar label="Produtos cadastrados" used={totalProducts} limit={productLimit} />
                  <UsageBar label="Usuários e convites" used={seats} limit={userLimit} />
                </div>

                {features.length > 0 ? (
                  <div className="mt-6 flex flex-wrap gap-2">
                    {features.map((feature) => (
                      <span
                        key={feature.key}
                        className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/85 ring-1 ring-white/15"
                      >
                        {featureLabel(feature)}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            {/* Quick access */}
            <div className="rounded-3xl border border-border bg-surface p-6 shadow-sm md:p-7">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-600">
                Acesso rápido
              </p>
              <h2 className="mt-1 font-display text-xl font-bold tracking-tight text-ink">
                Operações principais
              </h2>
              <div className="mt-5 grid gap-2.5">
                {[
                  { href: "/catalogo", label: "Novo produto", icon: ICONS.plus },
                  { href: "/estoque", label: "Atualizar estoque", icon: ICONS.stock },
                  { href: "/producao", label: "Registrar produção", icon: ICONS.production },
                  { href: "/equipe", label: "Gerenciar equipe", icon: ICONS.teamAlt },
                  { href: `/${overview.slug}`, label: "Abrir vitrine", icon: ICONS.storefront, external: true },
                  { href: "/assinatura", label: "Gerenciar assinatura", icon: ICONS.subscription },
                ].map((action) => (
                  <Link
                    key={action.href + action.label}
                    href={action.href}
                    target={action.external ? "_blank" : undefined}
                    rel={action.external ? "noreferrer" : undefined}
                    className="group flex items-center gap-3 rounded-xl border border-border bg-surface-soft px-4 py-3 text-sm font-medium text-ink transition-all hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface text-brand-600 shadow-sm ring-1 ring-border transition group-hover:bg-brand-600 group-hover:text-white">
                      <Icon path={action.icon} className="h-4 w-4" />
                    </span>
                    <span className="flex-1">{action.label}</span>
                    <Icon path={ICONS.arrow} className="h-4 w-4 text-ink-faint transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
                  </Link>
                ))}
              </div>
            </div>
          </section>

          {/* Recent activity */}
          <section className="rounded-3xl border border-border bg-surface p-6 shadow-sm md:p-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-600">
                  Central de atividades
                </p>
                <h2 className="mt-1 font-display text-xl font-bold tracking-tight text-ink md:text-2xl">
                  Movimentação recente
                </h2>
              </div>
              <span className="rounded-full bg-surface-soft px-3 py-1 text-xs font-medium text-ink-muted">
                {recentActivities.length} evento(s)
              </span>
            </div>

            {recentActivities.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed border-border bg-surface-soft p-8 text-center text-sm text-ink-muted">
                Nenhuma atividade registrada ainda. As ações realizadas no catálogo, estoque,
                produção, equipe e cobrança aparecerão aqui.
              </div>
            ) : (
              <ul className="mt-6 space-y-2.5">
                {recentActivities.map((activity) => {
                  const details = activity.after as { name?: string } | null;
                  const description =
                    ACTIVITY_LABELS[activity.action] ?? activity.action.replace(/\./g, " ");
                  return (
                    <li
                      key={activity.id}
                      className="flex items-start gap-4 rounded-2xl border border-border bg-surface-soft/60 px-4 py-3 transition hover:bg-surface-soft"
                    >
                      <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-surface text-brand-600 shadow-sm ring-1 ring-border">
                        <Icon path={ICONS.activity} className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink">
                          {description}
                          {details?.name ? (
                            <span className="font-normal text-ink-muted"> · {details.name}</span>
                          ) : null}
                        </p>
                        <p className="mt-1 text-xs text-ink-muted">
                          {new Intl.DateTimeFormat("pt-BR", {
                            dateStyle: "short",
                            timeStyle: "short",
                          }).format(activity.createdAt)}
                          {activity.actorType === "USER" ? " · usuário" : ""}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}