"use client";

import { useActionState } from "react";
import { saveIngredientAction, type InventoryState } from "@/modules/inventory/actions";
import { INGREDIENT_UNITS } from "@/modules/inventory/rules";

const initialState: InventoryState = {};

type Props = {
  ingredient?: {
    id: string;
    name: string;
    unit: string;
    costPerUnitCents: number;
    minStock: string;
    supplier: string | null;
  };
  submitLabel: string;
};

const fieldClass =
  "mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm focus:border-brand-600";

export function IngredientForm({ ingredient, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(saveIngredientAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      {ingredient ? <input type="hidden" name="id" value={ingredient.id} /> : null}

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
            Nome do insumo
          </label>
          <input
            id="name"
            name="name"
            required
            defaultValue={ingredient?.name ?? ""}
            placeholder="Farinha de trigo"
            className={fieldClass}
          />
          {state.fieldErrors?.name ? (
            <p className="mt-1 text-xs text-red-700">{state.fieldErrors.name}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="unit" className="block text-sm font-medium">
            Unidade
          </label>
          <select
            id="unit"
            name="unit"
            defaultValue={ingredient?.unit ?? "KG"}
            className={fieldClass}
          >
            {INGREDIENT_UNITS.map((unit) => (
              <option key={unit.value} value={unit.value}>
                {unit.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="cost" className="block text-sm font-medium">
            Custo por unidade (R$)
          </label>
          <input
            id="cost"
            name="cost"
            inputMode="decimal"
            placeholder="4,50"
            defaultValue={
              ingredient
                ? (ingredient.costPerUnitCents / 100).toFixed(2).replace(".", ",")
                : ""
            }
            className={fieldClass}
          />
          {state.fieldErrors?.cost ? (
            <p className="mt-1 text-xs text-red-700">{state.fieldErrors.cost}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="minStock" className="block text-sm font-medium">
            Estoque mínimo
          </label>
          <input
            id="minStock"
            name="minStock"
            inputMode="decimal"
            placeholder="0"
            defaultValue={ingredient ? formatDecimal(ingredient.minStock) : ""}
            className={fieldClass}
          />
          {state.fieldErrors?.minStock ? (
            <p className="mt-1 text-xs text-red-700">{state.fieldErrors.minStock}</p>
          ) : null}
          <p className="mt-1 text-xs text-ink-muted">
            Abaixo disso o painel mostra alerta. Zero desliga o alerta.
          </p>
        </div>

        <div>
          <label htmlFor="supplier" className="block text-sm font-medium">
            Fornecedor (opcional)
          </label>
          <input
            id="supplier"
            name="supplier"
            defaultValue={ingredient?.supplier ?? ""}
            className={fieldClass}
          />
        </div>
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

function formatDecimal(value: string): string {
  return String(Number(value)).replace(".", ",");
}
