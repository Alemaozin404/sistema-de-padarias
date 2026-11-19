import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AuthError, requireTenant } from "@/lib/auth";
import { loadEntitlements } from "@/modules/billing/queries";
import { hasFeature } from "@/modules/plans/entitlements";
import { listProducts } from "@/modules/catalog/queries";
import { listIngredients } from "@/modules/inventory/queries";
import { formatQuantity } from "@/modules/inventory/rules";
import { archiveRecipeAction, removeRecipeItemAction } from "@/modules/production/actions";
import { getRecipe } from "@/modules/production/queries";
import { formatBRL } from "@/modules/shared/money";
import { RecipeForm } from "@/components/production/recipe-form";
import { RecipeItemForm } from "@/components/production/recipe-item-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ficha técnica" };

export default async function RecipePage({
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

  const recipe = await getRecipe(membership.tenantId, id);
  if (!recipe) notFound();

  const [products, ingredients] = await Promise.all([
    listProducts(membership.tenantId),
    listIngredients(membership.tenantId),
  ]);

  const canWrite = loaded.entitlements.access.canWriteOperational;
  const usedIngredientIds = new Set(recipe.items.map((item) => item.ingredientId));
  const availableIngredients = ingredients
    .filter((ingredient) => !usedIngredientIds.has(ingredient.id))
    .map((ingredient) => ({
      id: ingredient.id,
      name: ingredient.name,
      unit: ingredient.unit,
    }));

  const yieldQuantity = Number(recipe.yieldQuantity);
  const totalCostCents = recipe.items.reduce(
    (total, item) => total + Math.round(Number(item.quantity) * item.unitCostCents),
    0,
  );
  const unitCostCents =
    recipe.items.length > 0 && yieldQuantity > 0
      ? Math.round(totalCostCents / yieldQuantity)
      : 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/producao" className="text-xs text-ink-muted hover:text-brand-700">
            ← Produção
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{recipe.name}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Gera{" "}
            <Link
              href={`/catalogo/${recipe.productId}`}
              className="text-brand-700 hover:underline"
            >
              {recipe.productName}
            </Link>{" "}
            · rendimento de {formatQuantity(recipe.yieldQuantity)}{" "}
            {recipe.yieldUnit.toLowerCase()}
            {recipe.isActive ? "" : " · ficha arquivada"}
          </p>
        </div>
        <div className="text-right text-sm">
          <p className="text-ink-muted">Custo da ficha</p>
          <p className="font-medium">{formatBRL(totalCostCents)}</p>
          <p className="mt-1 text-xs text-ink-muted">
            {formatBRL(unitCostCents)} por {recipe.yieldUnit.toLowerCase()}
          </p>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Insumos da ficha</h2>

        {recipe.items.length === 0 ? (
          <p className="rounded-lg border border-black/10 p-6 text-sm text-ink-muted">
            Nenhum insumo na ficha. Sem insumos não é possível planejar uma fornada.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-black/10">
            <table className="w-full text-sm">
              <thead className="bg-black/[0.03] text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Insumo</th>
                  <th className="px-4 py-3 font-medium">Quantidade</th>
                  <th className="px-4 py-3 font-medium">Custo unitário</th>
                  <th className="px-4 py-3 font-medium">Custo na ficha</th>
                  <th className="px-4 py-3 font-medium sr-only">Ações</th>
                </tr>
              </thead>
              <tbody>
                {recipe.items.map((item) => (
                  <tr key={item.id} className="border-t border-black/5">
                    <td className="px-4 py-3">
                      <Link
                        href={`/estoque/${item.ingredientId}`}
                        className="font-medium hover:text-brand-700"
                      >
                        {item.ingredientName}
                      </Link>
                      {item.isActive ? null : (
                        <span className="ml-2 text-xs text-ink-muted">· arquivado</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {formatQuantity(item.quantity)}{" "}
                      <span className="text-xs text-ink-muted">{item.unit.toLowerCase()}</span>
                    </td>
                    <td className="px-4 py-3 text-ink-muted">
                      {formatBRL(item.unitCostCents)}
                    </td>
                    <td className="px-4 py-3">
                      {formatBRL(Math.round(Number(item.quantity) * item.unitCostCents))}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canWrite ? (
                        <form action={removeRecipeItemAction}>
                          <input type="hidden" name="recipeId" value={recipe.id} />
                          <input type="hidden" name="itemId" value={item.id} />
                          <button
                            type="submit"
                            className="text-xs text-ink-muted hover:text-red-700"
                          >
                            Remover
                          </button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-ink-muted">
          As quantidades são para a ficha inteira. Na conclusão da fornada, cada insumo é
          multiplicado por (produzidas + perdas) ÷ rendimento.
        </p>

        {canWrite ? (
          availableIngredients.length > 0 ? (
            <div className="rounded-xl border border-black/10 p-4">
              <RecipeItemForm recipeId={recipe.id} ingredients={availableIngredients} />
            </div>
          ) : (
            <p className="text-xs text-ink-muted">
              Todos os insumos ativos já estão nesta ficha.
            </p>
          )
        ) : null}
      </section>

      {canWrite ? (
        <section className="rounded-xl border border-black/10 p-5">
          <h2 className="text-sm font-semibold">Editar ficha</h2>
          <div className="mt-4 max-w-3xl">
            <RecipeForm
              products={products.map((product) => ({ id: product.id, name: product.name }))}
              recipe={{
                id: recipe.id,
                name: recipe.name,
                productId: recipe.productId,
                yieldQuantity: recipe.yieldQuantity,
                yieldUnit: recipe.yieldUnit,
                notes: recipe.notes,
              }}
              submitLabel="Salvar alterações"
            />
          </div>
        </section>
      ) : null}

      {canWrite && recipe.isActive ? (
        <section className="rounded-xl border border-red-200 bg-red-50/40 p-5">
          <h2 className="text-sm font-semibold">Arquivar ficha</h2>
          <p className="mt-1 text-sm text-ink-muted">
            A ficha deixa de aceitar novas fornadas. Lotes já planejados continuam válidos e o
            histórico é preservado.
          </p>
          <form action={archiveRecipeAction} className="mt-3">
            <input type="hidden" name="recipeId" value={recipe.id} />
            <button
              type="submit"
              className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-red-700 hover:bg-red-50"
            >
              Arquivar esta ficha
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
