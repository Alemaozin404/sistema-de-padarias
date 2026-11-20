import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AuthError, requireTenant } from "@/lib/auth";
import { loadEntitlements } from "@/modules/billing/queries";
import { hasFeature } from "@/modules/plans/entitlements";
import { getIngredient, listMovements } from "@/modules/inventory/queries";
import { MOVEMENT_LABELS, formatQuantity, stockStatus } from "@/modules/inventory/rules";
import { formatBRL } from "@/modules/shared/money";
import { IngredientForm } from "@/components/inventory/ingredient-form";
import { MovementForm } from "@/components/inventory/movement-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Insumo" };

export default async function IngredientPage({
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
  if (!loaded || !hasFeature(loaded.entitlements, "stock.basic")) notFound();

  const ingredient = await getIngredient(membership.tenantId, id);
  if (!ingredient) notFound();

  const movements = await listMovements(membership.tenantId, {
    ingredientId: ingredient.id,
    pageSize: 20,
  });

  const canWrite = loaded.entitlements.access.canWriteOperational;
  const ingredientOptions = ingredient.isActive
    ? [{ id: ingredient.id, name: ingredient.name, unit: ingredient.unit }]
    : [];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/estoque" className="text-xs text-ink-muted hover:text-brand-700">
            ← Estoque
          </Link>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink">{ingredient.name}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Saldo atual: {formatQuantity(ingredient.quantity)}{" "}
            {ingredient.unit.toLowerCase()} · mínimo {formatQuantity(ingredient.minStock)}
            {stockStatus({ quantity: ingredient.quantity, minStock: ingredient.minStock }) ===
            "OK"
              ? ""
              : " · em alerta"}
          </p>
        </div>
        <p className="text-sm text-ink-muted">
          Custo de referência: {formatBRL(ingredient.costPerUnitCents)}
        </p>
      </div>

      {ingredient.isActive && canWrite ? (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold">Registrar movimento</h2>
          <div className="mt-4 max-w-3xl">
            <MovementForm ingredients={ingredientOptions} presetIngredientId={ingredient.id} />
          </div>
        </section>
      ) : null}

      {canWrite ? (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold">Editar insumo</h2>
          <p className="mt-1 text-xs text-ink-muted">
            Mudar o custo ou o mínimo não altera o saldo nem o histórico.
            {ingredient.isActive ? "" : " Este insumo está arquivado e não recebe movimentos."}
          </p>
          <div className="mt-4 max-w-3xl">
            <IngredientForm
              ingredient={ingredient}
              submitLabel="Salvar alterações"
            />
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Movimentos deste insumo</h2>
        {movements.rows.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface p-6 text-sm text-ink-muted">
            Nenhum movimento registrado.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-surface-sunken text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Data</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Quantidade</th>
                  <th className="px-4 py-3 font-medium">Custo</th>
                  <th className="px-4 py-3 font-medium">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {movements.rows.map((movement) => (
                  <tr key={movement.id} className="border-t border-border">
                    <td className="px-4 py-3 text-ink-muted">
                      {movement.createdAt.toLocaleString("pt-BR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      {MOVEMENT_LABELS[
                        movement.movementType as keyof typeof MOVEMENT_LABELS
                      ] ?? movement.movementType}
                      {movement.movementType === "ADJUSTMENT"
                        ? movement.adjustmentDirection === "DECREASE"
                          ? " (redução)"
                          : " (aumento)"
                        : ""}
                    </td>
                    <td className="px-4 py-3">{formatQuantity(movement.quantity)}</td>
                    <td className="px-4 py-3">{formatBRL(movement.unitCostCents)}</td>
                    <td className="px-4 py-3 text-ink-muted">{movement.reason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
