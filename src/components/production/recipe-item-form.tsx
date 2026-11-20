"use client";

import { useActionState } from "react";
import { addRecipeItemAction, type ProductionState } from "@/modules/production/actions";

const initialState: ProductionState = {};

type Props = {
  recipeId: string;
  ingredients: Array<{ id: string; name: string; unit: string }>;
};

const fieldClass =
  "mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand-600";

export function RecipeItemForm({ recipeId, ingredients }: Props) {
  const [state, formAction, pending] = useActionState(addRecipeItemAction, initialState);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="recipeId" value={recipeId} />

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

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-52 flex-1">
          <label htmlFor="ingredientId" className="block text-sm font-medium">
            Insumo
          </label>
          <select id="ingredientId" name="ingredientId" required className={fieldClass}>
            <option value="">Escolha o insumo</option>
            {ingredients.map((ingredient) => (
              <option key={ingredient.id} value={ingredient.id}>
                {ingredient.name} ({ingredient.unit})
              </option>
            ))}
          </select>
          {state.fieldErrors?.ingredientId ? (
            <p className="mt-1 text-xs text-red-700">{state.fieldErrors.ingredientId}</p>
          ) : null}
        </div>

        <div className="w-40">
          <label htmlFor="quantity" className="block text-sm font-medium">
            Quantidade
          </label>
          <input
            id="quantity"
            name="quantity"
            inputMode="decimal"
            required
            placeholder="10"
            className={fieldClass}
          />
          {state.fieldErrors?.quantity ? (
            <p className="mt-1 text-xs text-red-700">{state.fieldErrors.quantity}</p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Adicionando…" : "Adicionar"}
        </button>
      </div>
    </form>
  );
}
