import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthError, requireTenant } from "@/lib/auth";
import { loadEntitlements } from "@/modules/billing/queries";
import { hasFeature } from "@/modules/plans/entitlements";
import { archiveIngredientAction } from "@/modules/inventory/actions";
import { listIngredients, listMovements } from "@/modules/inventory/queries";
import {
  MOVEMENT_LABELS,
  formatQuantity,
  isLowStock,
  stockStatus,
} from "@/modules/inventory/rules";
import { formatBRL } from "@/modules/shared/money";
import { IngredientForm } from "@/components/inventory/ingredient-form";
import { MovementForm } from "@/components/inventory/movement-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Estoque" };

const STATUS_STYLE = {
  EMPTY: "bg-red-50 text-red-700",
  LOW: "bg-amber-50 text-amber-700",
  OK: "bg-emerald-50 text-emerald-700",
} as const;

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; pagina?: string }>;
}) {
  const params = await searchParams;

  let membership;
  try {
    membership = await requireTenant();
  } catch (error) {
    if (error instanceof AuthError) redirect("/login");
    throw error;
  }

  const loaded = await loadEntitlements(membership.tenantId);
  const hasStock = loaded ? hasFeature(loaded.entitlements, "stock.basic") : false;

  if (!hasStock) {
    return (
      <div className="space-y-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">Estoque</p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink">Controle de estoque</h1>
        </div>
        <p className="rounded-xl border border-border bg-surface p-6 text-sm text-ink-muted">
          {loaded
            ? "O controle de estoque está disponível nos planos Profissional e Empresarial. Fale com o suporte para fazer upgrade."
            : "Nenhuma assinatura ativa encontrada. Fale com o suporte."}
        </p>
      </div>
    );
  }

  const page = Math.max(Number(params.pagina) || 1, 1);

  const [ingredients, movements] = await Promise.all([
    listIngredients(membership.tenantId, { search: params.q, includeInactive: true }),
    listMovements(membership.tenantId, { page }),
  ]);

  const canWrite = loaded?.entitlements.access.canWriteOperational ?? false;
  const pageHref = (target: number) => {
    const query = new URLSearchParams();
    if (params.q) query.set("q", params.q);
    query.set("pagina", String(target));
    return `/estoque?${query.toString()}`;
  };

  const activeIngredients = ingredients.filter((ingredient) => ingredient.isActive);
  const alerts = activeIngredients.filter((ingredient) =>
    isLowStock({ quantity: ingredient.quantity, minStock: ingredient.minStock }),
  );

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">Estoque</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink">Insumos</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {activeIngredients.length}{" "}
          {activeIngredients.length === 1 ? "insumo ativo" : "insumos ativos"}
          {alerts.length > 0 ? ` · ${alerts.length} em alerta` : ""}
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
          Você pode consultar o estoque, mas os lançamentos estão suspensos por pendência
          financeira. Seus dados continuam disponíveis para consulta e exportação.
        </p>
      ) : null}

      {alerts.length > 0 ? (
        <section className="rounded-xl border border-amber-300 bg-amber-50/60 p-5">
          <h2 className="text-sm font-semibold text-amber-900">Estoque baixo</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {alerts.map((ingredient) => (
              <li key={ingredient.id} className="rounded-lg border border-amber-300 bg-white p-3 text-sm">
                <span className="font-medium">{ingredient.name}</span>
                <span className="ml-2 text-ink-muted">
                  saldo {formatQuantity(ingredient.quantity)} {ingredient.unit.toLowerCase()} · mínimo{" "}
                  {formatQuantity(ingredient.minStock)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {canWrite ? (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold">Cadastrar insumo</h2>
          <p className="mt-1 text-xs text-ink-muted">
            O saldo começa em zero e só muda por movimento. Entradas, saídas, ajustes e perdas
            ficam no histórico com autor e data.
          </p>
          <div className="mt-4 max-w-3xl">
            <IngredientForm submitLabel="Cadastrar insumo" />
          </div>
        </section>
      ) : null}

      <section className="space-y-4">
        <form className="flex flex-wrap gap-2" action="/estoque">
          <input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Buscar insumo"
            className="rounded-lg border border-border px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-lg border border-border px-3 py-2 text-sm hover:border-brand-600"
          >
            Filtrar
          </button>
        </form>

        {ingredients.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface p-6 text-sm text-ink-muted">
            Nenhum insumo cadastrado.{" "}
            {canWrite ? "Cadastre o primeiro acima e registre a entrada inicial." : ""}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-surface-sunken text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Insumo</th>
                  <th className="px-4 py-3 font-medium">Saldo</th>
                  <th className="px-4 py-3 font-medium">Mínimo</th>
                  <th className="px-4 py-3 font-medium">Custo</th>
                  <th className="px-4 py-3 font-medium">Situação</th>
                  <th className="px-4 py-3 font-medium sr-only">Ações</th>
                </tr>
              </thead>
              <tbody>
                {ingredients.map((ingredient) => {
                  const status = stockStatus({
                    quantity: ingredient.quantity,
                    minStock: ingredient.minStock,
                  });

                  return (
                    <tr key={ingredient.id} className="border-t border-border">
                      <td className="px-4 py-3">
                        <Link
                          href={`/estoque/${ingredient.id}`}
                          className="font-medium hover:text-brand-700"
                        >
                          {ingredient.name}
                        </Link>
                        <p className="text-xs text-ink-muted">
                          {ingredient.supplier ?? "sem fornecedor"}
                          {ingredient.isActive ? "" : " · arquivado"}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        {formatQuantity(ingredient.quantity)}{" "}
                        <span className="text-xs text-ink-muted">
                          {ingredient.unit.toLowerCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-ink-muted">
                        {formatQuantity(ingredient.minStock)}
                      </td>
                      <td className="px-4 py-3">{formatBRL(ingredient.costPerUnitCents)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[status]}`}
                        >
                          {status === "EMPTY" ? "Zerado" : status === "LOW" ? "Baixo" : "OK"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-3">
                          {ingredient.isActive ? (
                            <Link
                              href={`/estoque/${ingredient.id}`}
                              className="text-xs text-brand-700 hover:underline"
                            >
                              Detalhes
                            </Link>
                          ) : null}
                          {canWrite && ingredient.isActive ? (
                            <form action={archiveIngredientAction}>
                              <input type="hidden" name="ingredientId" value={ingredient.id} />
                              <button
                                type="submit"
                                className="text-xs text-ink-muted hover:text-red-700"
                              >
                                Arquivar
                              </button>
                            </form>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canWrite && activeIngredients.length > 0 ? (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold">Registrar movimento</h2>
          <p className="mt-1 text-xs text-ink-muted">
            Movimento é imutável. Para corrigir um lançamento, registre um ajuste com o motivo.
          </p>
          <div className="mt-4 max-w-3xl">
            <MovementForm
              ingredients={activeIngredients.map((ingredient) => ({
                id: ingredient.id,
                name: ingredient.name,
                unit: ingredient.unit,
              }))}
            />
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold">Histórico de movimentos</h2>
            <p className="mt-1 text-xs text-ink-muted">
              {movements.total} {movements.total === 1 ? "lançamento" : "lançamentos"} ·
              página {movements.page} de {movements.pageCount}
            </p>
          </div>
        </div>

        {movements.rows.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface p-6 text-sm text-ink-muted">
            Nenhum movimento registrado ainda.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-surface-sunken text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Data</th>
                  <th className="px-4 py-3 font-medium">Insumo</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Quantidade</th>
                  <th className="px-4 py-3 font-medium">Custo</th>
                  <th className="px-4 py-3 font-medium">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {movements.rows.map((movement) => {
                  const type = movement.movementType;
                  const sign =
                    type === "ADJUSTMENT"
                      ? movement.adjustmentDirection === "DECREASE"
                        ? "−"
                        : "+"
                      : type === "IN"
                        ? "+"
                        : "−";

                  return (
                    <tr key={movement.id} className="border-t border-border">
                      <td className="px-4 py-3 text-ink-muted">
                        {movement.createdAt.toLocaleString("pt-BR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="px-4 py-3">
                        {movement.itemName ?? "Insumo removido"}
                        {movement.itemUnit ? (
                          <span className="text-xs text-ink-muted">
                            {" "}
                            · {movement.itemUnit.toLowerCase()}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        {MOVEMENT_LABELS[type as keyof typeof MOVEMENT_LABELS] ?? type}
                        {type === "ADJUSTMENT" ? (
                          <span className="text-xs text-ink-muted">
                            {" "}
                            · {movement.adjustmentDirection === "DECREASE" ? "redução" : "aumento"}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        {sign}
                        {formatQuantity(movement.quantity)}
                      </td>
                      <td className="px-4 py-3">{formatBRL(movement.unitCostCents)}</td>
                      <td className="px-4 py-3 text-ink-muted">{movement.reason ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {movements.pageCount > 1 ? (
          <div className="flex justify-between text-sm">
            {movements.page > 1 ? (
              <Link
                href={pageHref(movements.page - 1)}
                className="text-brand-700 hover:underline"
              >
                ← Mais recentes
              </Link>
            ) : (
              <span />
            )}
            {movements.page < movements.pageCount ? (
              <Link
                href={pageHref(movements.page + 1)}
                className="text-brand-700 hover:underline"
              >
                Mais antigos →
              </Link>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
