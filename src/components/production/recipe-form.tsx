"use client";

import { useActionState } from "react";
import { saveRecipeAction, type ProductionState } from "@/modules/production/actions";
import { PRODUCT_UNITS } from "@/modules/catalog/rules";

const initialState: ProductionState = {};

type Props = {
  products: Array<{ id: string; name: string }>;
  recipe?: {
    id: string;
    name: string;
    productId: string;
    yieldQuantity: string;
    yieldUnit: string;
    notes: string | null;
  };
  submitLabel: string;
};

const fieldClass =
  "mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand-600";

export function RecipeForm({ products, recipe, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(saveRecipeAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      {recipe ? <input type="hidden" name="id" value={recipe.id} /> : null}

      {state.error ? (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          {state.success}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="block text-sm font-medium">
            Nome da ficha
          </label>
          <input
            id="name"
            name="name"
            required
            defaultValue={recipe?.name ?? ""}
            placeholder="Pão francês — fornada padrão"
            className={fieldClass}
          />
          {state.fieldErrors?.name ? (
            <p className="mt-1 text-xs text-red-700">{state.fieldErrors.name}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="productId" className="block text-sm font-medium">
            Produto gerado
          </label>
          <select
            id="productId"
            name="productId"
            required
            defaultValue={recipe?.productId ?? ""}
            className={fieldClass}
          >
            <option value="">Escolha o produto</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
          {state.fieldErrors?.productId ? (
            <p className="mt-1 text-xs text-red-700">{state.fieldErrors.productId}</p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="yieldQuantity" className="block text-sm font-medium">
            Rendimento
          </label>
          <input
            id="yieldQuantity"
            name="yieldQuantity"
            inputMode="decimal"
            required
            placeholder="100"
            defaultValue={recipe ? String(Number(recipe.yieldQuantity)).replace(".", ",") : ""}
            className={fieldClass}
          />
          {state.fieldErrors?.yieldQuantity ? (
            <p className="mt-1 text-xs text-red-700">{state.fieldErrors.yieldQuantity}</p>
          ) : null}
          <p className="mt-1 text-xs text-ink-muted">
            Quantas unidades o produto rende com a ficha inteira.
          </p>
        </div>

        <div>
          <label htmlFor="yieldUnit" className="block text-sm font-medium">
            Unidade do rendimento
          </label>
          <select
            id="yieldUnit"
            name="yieldUnit"
            defaultValue={recipe?.yieldUnit ?? "UN"}
            className={fieldClass}
          >
            {PRODUCT_UNITS.map((unit) => (
              <option key={unit.value} value={unit.value}>
                {unit.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="notes" className="block text-sm font-medium">
          Observações (opcional)
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          maxLength={600}
          defaultValue={recipe?.notes ?? ""}
          className={fieldClass}
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "Salvando…" : submitLabel}
      </button>
    </form>
  );
}
