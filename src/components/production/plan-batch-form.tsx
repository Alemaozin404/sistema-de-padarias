"use client";

import { useActionState } from "react";
import { planBatchAction, type ProductionState } from "@/modules/production/actions";

const initialState: ProductionState = {};

type Props = {
  recipes: Array<{ id: string; name: string; productName: string; yieldQuantity: string }>;
};

const fieldClass =
  "mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand-600";

export function PlanBatchForm({ recipes }: Props) {
  const [state, formAction, pending] = useActionState(planBatchAction, initialState);

  return (
    <form action={formAction} className="space-y-3">
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
        <div className="min-w-56 flex-1">
          <label htmlFor="recipeId" className="block text-sm font-medium">
            Ficha técnica
          </label>
          <select id="recipeId" name="recipeId" required className={fieldClass}>
            <option value="">Escolha a ficha</option>
            {recipes.map((recipe) => (
              <option key={recipe.id} value={recipe.id}>
                {recipe.name} — {recipe.productName} (rende {Number(recipe.yieldQuantity)})
              </option>
            ))}
          </select>
          {state.fieldErrors?.recipeId ? (
            <p className="mt-1 text-xs text-red-700">{state.fieldErrors.recipeId}</p>
          ) : null}
        </div>

        <div className="w-44">
          <label htmlFor="plannedQuantity" className="block text-sm font-medium">
            Quantidade planejada
          </label>
          <input
            id="plannedQuantity"
            name="plannedQuantity"
            inputMode="decimal"
            required
            placeholder="100"
            className={fieldClass}
          />
          {state.fieldErrors?.plannedQuantity ? (
            <p className="mt-1 text-xs text-red-700">{state.fieldErrors.plannedQuantity}</p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Planejando…" : "Planejar fornada"}
        </button>
      </div>

      <div>
        <label htmlFor="notes" className="block text-sm font-medium">
          Observações (opcional)
        </label>
        <input
          id="notes"
          name="notes"
          maxLength={600}
          placeholder="Ex.: fornada da madrugada"
          className={fieldClass}
        />
      </div>
    </form>
  );
}
