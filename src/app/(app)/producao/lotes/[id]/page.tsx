import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AuthError, requireTenant } from "@/lib/auth";
import { loadEntitlements } from "@/modules/billing/queries";
import { hasFeature } from "@/modules/plans/entitlements";
import { listIngredients } from "@/modules/inventory/queries";
import { formatQuantity, roundQuantity } from "@/modules/inventory/rules";
import { cancelBatchAction } from "@/modules/production/actions";
import { getBatch, getRecipe, listBatchLosses } from "@/modules/production/queries";
import { BATCH_STATUS_LABELS, productionFactor } from "@/modules/production/rules";
import { formatBRL } from "@/modules/shared/money";
import { CompleteBatchForm } from "@/components/production/complete-batch-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fornada" };

const STATUS_STYLE: Record<string, string> = {
  PLANNED: "bg-amber-50 text-amber-700",
  IN_PROGRESS: "bg-sky-50 text-sky-700",
  DONE: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-neutral-100 text-neutral-600",
};

export default async function BatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let membership;
  try {
    membership = await requireTenant();
  } catch (error) {
    if (error instanceof AuthError) redirect("/login");
    throw error;
  }

  const loaded = await loadEntitlements(membership.tenantId);
  if (!loaded || !hasFeature(loaded.entitlements, "production.enabled")) notFound();

  const batch = await getBatch(membership.tenantId, id);
  if (!batch) notFound();

  const [recipe, losses, ingredients] = await Promise.all([
    getRecipe(membership.tenantId, batch.recipeId),
    listBatchLosses(membership.tenantId, batch.id),
    listIngredients(membership.tenantId, { includeInactive: true }),
  ]);

  if (!recipe) notFound();

  const canWrite = loaded.entitlements.access.canWriteOperational;
  const canComplete = canWrite && batch.status === "PLANNED";

  const balanceByIngredient = new Map(
    ingredients.map((ingredient) => [ingredient.id, ingredient.quantity]),
  );

  let plannedFactor: number | null = null;
  try {
    plannedFactor = productionFactor({
      yieldQuantity: Number(recipe.yieldQuantity),
      producedQuantity: Number(batch.plannedQuantity),
      lossQuantity: 0,
    });
  } catch {
    plannedFactor = null;
  }

  const producedQuantity = batch.producedQuantity ? Number(batch.producedQuantity) : null;
  const lossTotal = losses.reduce((total, loss) => total + Number(loss.quantity), 0);

  // Numa fornada concluída, a tabela mostra o que foi realmente consumido.
  let actualFactor: number | null = null;
  if (producedQuantity !== null) {
    try {
      actualFactor = productionFactor({
        yieldQuantity: Number(recipe.yieldQuantity),
        producedQuantity,
        lossQuantity: lossTotal,
      });
    } catch {
      actualFactor = null;
    }
  }

  const displayFactor = batch.status === "DONE" ? actualFactor : plannedFactor;

  const requirements = recipe.items.map((item) => {
    const required = displayFactor
      ? roundQuantity(Number(item.quantity) * displayFactor)
      : 0;
    const balance = Number(balanceByIngredient.get(item.ingredientId) ?? 0);
    return {
      ...item,
      required,
      balance,
      sufficient: balance >= required,
    };
  });

  const missing = requirements.filter((item) => !item.sufficient);
  const totalCostCents = producedQuantity ? producedQuantity * batch.unitCostCents : 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/producao" className="text-xs text-ink-muted hover:text-brand-700">
            ← Produção
          </Link>
          <h1 className="mt-1 flex items-center gap-3 font-display text-2xl font-bold tracking-tight text-ink">
            {batch.recipeName}
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                STATUS_STYLE[batch.status] ?? "bg-neutral-100 text-neutral-600"
              }`}
            >
              {BATCH_STATUS_LABELS[batch.status] ?? batch.status}
            </span>
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Planejada em {batch.plannedAt.toLocaleDateString("pt-BR")} ·{" "}
            <Link
              href={`/producao/receitas/${recipe.id}`}
              className="text-brand-700 hover:underline"
            >
              ver ficha
            </Link>{" "}
            · produto:{" "}
            <Link
              href={`/catalogo/${recipe.productId}`}
              className="text-brand-700 hover:underline"
            >
              {batch.productName}
            </Link>
          </p>
        </div>
        <div className="text-right text-sm">
          <p className="text-ink-muted">
            Planejado: {formatQuantity(batch.plannedQuantity)} un.
          </p>
          {batch.status === "DONE" ? (
            <>
              <p className="mt-1 font-medium">
                Produzido: {formatQuantity(batch.producedQuantity ?? 0)} un.
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                Custo real: {formatBRL(batch.unitCostCents)}/un. ·{" "}
                {formatBRL(totalCostCents)} no lote
              </p>
            </>
          ) : null}
        </div>
      </div>

      {batch.notes ? (
        <p className="rounded-lg bg-surface-sunken p-4 text-sm text-ink-muted">{batch.notes}</p>
      ) : null}

      {canComplete ? (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold">Concluir fornada</h2>
          <p className="mt-1 text-xs text-ink-muted">
            O consumo usa (produzidas + perdas) ÷ rendimento da ficha. Se faltar insumo, a
            conclusão é bloqueada e nada é alterado.
          </p>
          <div className="mt-4 max-w-2xl">
            <CompleteBatchForm
              batchId={batch.id}
              plannedQuantity={batch.plannedQuantity}
            />
          </div>
        </section>
      ) : null}

      {batch.status === "DONE" ? (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-5">
          <h2 className="text-sm font-semibold">Custo real desta fornada</h2>
          <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs uppercase tracking-wide text-ink-muted">Unidades boas</dt>
              <dd className="mt-1 font-medium">{formatQuantity(batch.producedQuantity ?? 0)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-ink-muted">Custo por unidade</dt>
              <dd className="mt-1 font-medium">{formatBRL(batch.unitCostCents)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-ink-muted">
                Custo total do lote
              </dt>
              <dd className="mt-1 font-medium">{formatBRL(totalCostCents)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-ink-muted">
            O custo usa o custo dos insumos no momento da conclusão. O produto acabado entrou no
            estoque com esse custo por unidade.
          </p>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">
          {batch.status === "DONE" ? "Consumo da ficha" : "Insumos necessários (planejado)"}
        </h2>

        {requirements.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface p-6 text-sm text-ink-muted">
            A ficha não tem insumos.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-surface-sunken text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Insumo</th>
                  <th className="px-4 py-3 font-medium">
                    {batch.status === "DONE" ? "Consumo real" : "Necessário (planejado)"}
                  </th>
                  {batch.status === "DONE" ? null : (
                    <>
                      <th className="px-4 py-3 font-medium">Saldo atual</th>
                      <th className="px-4 py-3 font-medium">Situação</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {requirements.map((item) => (
                  <tr key={item.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <Link
                        href={`/estoque/${item.ingredientId}`}
                        className="font-medium hover:text-brand-700"
                      >
                        {item.ingredientName}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {formatQuantity(item.required)}{" "}
                      <span className="text-xs text-ink-muted">{item.unit.toLowerCase()}</span>
                    </td>
                    {batch.status === "DONE" ? null : (
                      <>
                        <td className="px-4 py-3 text-ink-muted">
                          {formatQuantity(item.balance)}
                        </td>
                        <td className="px-4 py-3">
                          {item.sufficient ? (
                            <span className="text-xs text-emerald-700">Suficiente</span>
                          ) : (
                            <span className="text-xs text-red-700">Insuficiente</span>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {batch.status === "PLANNED" && plannedFactor === null ? (
          <p className="text-xs text-red-700">
            Não foi possível calcular a necessidade: revise o rendimento da ficha.
          </p>
        ) : null}

        {batch.status === "PLANNED" && missing.length > 0 ? (
          <p className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            Estoque insuficiente para: {missing.map((item) => item.ingredientName).join(", ")}.
            Registre a entrada no estoque antes de concluir.
          </p>
        ) : null}
      </section>

      {losses.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Perdas registradas</h2>
          <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-surface-sunken text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Registrada em</th>
                  <th className="px-4 py-3 font-medium">Quantidade</th>
                  <th className="px-4 py-3 font-medium">Custo</th>
                  <th className="px-4 py-3 font-medium">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {losses.map((loss) => (
                  <tr key={loss.id} className="border-t border-border">
                    <td className="px-4 py-3 text-ink-muted">
                      {loss.createdAt.toLocaleString("pt-BR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="px-4 py-3">{formatQuantity(loss.quantity)}</td>
                    <td className="px-4 py-3">{formatBRL(loss.costCents)}</td>
                    <td className="px-4 py-3 text-ink-muted">{loss.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {canWrite && batch.status === "PLANNED" ? (
        <section className="rounded-xl border border-red-200 bg-red-50/40 p-5">
          <h2 className="text-sm font-semibold">Cancelar fornada</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Cancelar não gera movimento de estoque. Só uma fornada planejada pode ser cancelada.
          </p>
          <form action={cancelBatchAction} className="mt-3">
            <input type="hidden" name="batchId" value={batch.id} />
            <button
              type="submit"
              className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-red-700 hover:bg-red-50"
            >
              Cancelar esta fornada
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
