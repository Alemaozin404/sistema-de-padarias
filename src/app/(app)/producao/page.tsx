import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthError, requireTenant } from "@/lib/auth";
import { loadEntitlements } from "@/modules/billing/queries";
import { hasFeature } from "@/modules/plans/entitlements";
import { listIngredients } from "@/modules/inventory/queries";
import { listProducts } from "@/modules/catalog/queries";
import { listBatches, listRecipes } from "@/modules/production/queries";
import { BATCH_STATUS_LABELS } from "@/modules/production/rules";
import { formatBRL } from "@/modules/shared/money";
import { RecipeForm } from "@/components/production/recipe-form";
import { PlanBatchForm } from "@/components/production/plan-batch-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Produção" };

const STATUS_STYLE: Record<string, string> = {
  PLANNED: "bg-amber-50 text-amber-700",
  IN_PROGRESS: "bg-sky-50 text-sky-700",
  DONE: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-neutral-100 text-neutral-600",
};

export default async function ProductionPage() {
  let membership;
  try {
    membership = await requireTenant();
  } catch (error) {
    if (error instanceof AuthError) redirect("/login");
    throw error;
  }

  const loaded = await loadEntitlements(membership.tenantId);
  const hasProduction = loaded
    ? hasFeature(loaded.entitlements, "production.enabled")
    : false;

  if (!hasProduction) {
    return (
      <div className="space-y-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">Produção</p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink">Fichas e fornadas</h1>
        </div>
        <p className="rounded-xl border border-border bg-surface p-6 text-sm text-ink-muted">
          {loaded
            ? "A gestão de produção está disponível no plano Empresarial. Fale com o suporte para fazer upgrade."
            : "Nenhuma assinatura ativa encontrada. Fale com o suporte."}
        </p>
      </div>
    );
  }

  const [recipes, batches, products, ingredients] = await Promise.all([
    listRecipes(membership.tenantId),
    listBatches(membership.tenantId),
    listProducts(membership.tenantId),
    listIngredients(membership.tenantId),
  ]);

  const canWrite = loaded?.entitlements.access.canWriteOperational ?? false;
  const activeRecipes = recipes.filter((recipe) => recipe.isActive);
  const plannable = activeRecipes.filter((recipe) => recipe.itemCount > 0);
  const planned = batches.filter((batch) => batch.status === "PLANNED");

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">Produção</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink">Fichas e fornadas</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {activeRecipes.length}{" "}
          {activeRecipes.length === 1 ? "ficha ativa" : "fichas ativas"} ·{" "}
          {planned.length} {planned.length === 1 ? "fornada planejada" : "fornadas planejadas"}
        </p>
      </div>

      {loaded?.entitlements.warning ? (
        <div
          role="status"
          className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
        >
          {loaded.entitlements.warning}
        </div>
      ) : null}

      {!canWrite ? (
        <p className="rounded-xl border border-border bg-surface p-4 text-sm text-ink-muted">
          Você pode consultar as fichas e o histórico, mas os lançamentos estão suspensos por
          pendência financeira.
        </p>
      ) : null}

      {canWrite ? (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold">Nova ficha técnica</h2>
          <p className="mt-1 text-xs text-ink-muted">
            O rendimento é o total que a ficha inteira produz. Os insumos são adicionados na
            ficha, depois de criá-la.
          </p>
          <div className="mt-4 max-w-3xl">
            <RecipeForm
              products={products.map((product) => ({ id: product.id, name: product.name }))}
              submitLabel="Criar ficha"
            />
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Fichas técnicas</h2>

        {recipes.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface p-6 text-sm text-ink-muted">
            Nenhuma ficha cadastrada. {canWrite ? "Crie a primeira acima." : ""}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-surface-sunken text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Ficha</th>
                  <th className="px-4 py-3 font-medium">Produto</th>
                  <th className="px-4 py-3 font-medium">Rendimento</th>
                  <th className="px-4 py-3 font-medium">Insumos</th>
                  <th className="px-4 py-3 font-medium">Custo/un. estimado</th>
                  <th className="px-4 py-3 font-medium sr-only">Ações</th>
                </tr>
              </thead>
              <tbody>
                {recipes.map((recipe) => {
                  const estimatedUnit =
                    Number(recipe.yieldQuantity) > 0
                      ? Math.round(recipe.estimatedTotalCents / Number(recipe.yieldQuantity))
                      : 0;

                  return (
                    <tr key={recipe.id} className="border-t border-border">
                      <td className="px-4 py-3">
                        <Link
                          href={`/producao/receitas/${recipe.id}`}
                          className="font-medium hover:text-brand-700"
                        >
                          {recipe.name}
                        </Link>
                        {recipe.isActive ? null : (
                          <span className="ml-2 text-xs text-ink-muted">· arquivada</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-ink-muted">{recipe.productName}</td>
                      <td className="px-4 py-3">
                        {Number(recipe.yieldQuantity)}{" "}
                        <span className="text-xs text-ink-muted">
                          {recipe.yieldUnit.toLowerCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3">{recipe.itemCount}</td>
                      <td className="px-4 py-3">
                        {recipe.itemCount > 0 ? formatBRL(estimatedUnit) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/producao/receitas/${recipe.id}`}
                          className="text-xs text-brand-700 hover:underline"
                        >
                          Abrir
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canWrite && plannable.length > 0 ? (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold">Planejar fornada</h2>
          <p className="mt-1 text-xs text-ink-muted">
            Planejar não move estoque. O consumo e a entrada do produto acontecem na conclusão.
          </p>
          <div className="mt-4 max-w-3xl">
            <PlanBatchForm
              recipes={plannable.map((recipe) => ({
                id: recipe.id,
                name: recipe.name,
                productName: recipe.productName,
                yieldQuantity: recipe.yieldQuantity,
              }))}
            />
          </div>
        </section>
      ) : null}

      {canWrite && activeRecipes.length > 0 && plannable.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-4 text-sm text-ink-muted">
          Adicione insumos a uma ficha para poder planejar fornadas.
        </p>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Fornadas</h2>

        {batches.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface p-6 text-sm text-ink-muted">
            Nenhuma fornada registrada.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-surface-sunken text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Planejada em</th>
                  <th className="px-4 py-3 font-medium">Ficha</th>
                  <th className="px-4 py-3 font-medium">Produto</th>
                  <th className="px-4 py-3 font-medium">Qtd.</th>
                  <th className="px-4 py-3 font-medium">Custo/un.</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium sr-only">Ações</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => (
                  <tr key={batch.id} className="border-t border-border">
                    <td className="px-4 py-3 text-ink-muted">
                      {batch.plannedAt.toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/producao/lotes/${batch.id}`}
                        className="font-medium hover:text-brand-700"
                      >
                        {batch.recipeName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{batch.productName}</td>
                    <td className="px-4 py-3">
                      {batch.producedQuantity
                        ? `${Number(batch.producedQuantity)} de ${Number(batch.plannedQuantity)}`
                        : Number(batch.plannedQuantity)}
                    </td>
                    <td className="px-4 py-3">
                      {batch.status === "DONE" ? formatBRL(batch.unitCostCents) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          STATUS_STYLE[batch.status] ?? "bg-neutral-100 text-neutral-600"
                        }`}
                      >
                        {BATCH_STATUS_LABELS[batch.status] ?? batch.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/producao/lotes/${batch.id}`}
                        className="text-xs text-brand-700 hover:underline"
                      >
                        Abrir
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-ink-muted">
        {ingredients.length === 0
          ? "Cadastre insumos no estoque para montar fichas técnicas."
          : "Consumo e custo usam o custo atual dos insumos no momento da conclusão."}
      </p>
    </div>
  );
}
