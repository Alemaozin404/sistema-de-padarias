"use client";

import { useActionState, useState } from "react";
import { recordMovementAction, type InventoryState } from "@/modules/inventory/actions";
import { MOVEMENT_TYPES, requiresReason } from "@/modules/inventory/rules";

const initialState: InventoryState = {};

type Option = { id: string; name: string; unit: string };

type Props = {
  ingredients: Option[];
  presetIngredientId?: string;
};

const fieldClass =
  "mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand-600";

export function MovementForm({ ingredients, presetIngredientId }: Props) {
  const [state, formAction, pending] = useActionState(recordMovementAction, initialState);
  const [movementType, setMovementType] = useState<string>("IN");

  const needsReason = requiresReason(movementType);

  return (
    <form action={formAction} className="space-y-4">
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
          <label htmlFor="ingredientId" className="block text-sm font-medium">
            Insumo
          </label>
          <select
            id="ingredientId"
            name="ingredientId"
            required
            defaultValue={presetIngredientId ?? ""}
            className={fieldClass}
          >
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

        <div>
          <label htmlFor="movementType" className="block text-sm font-medium">
            Tipo
          </label>
          <select
            id="movementType"
            name="movementType"
            value={movementType}
            onChange={(event) => setMovementType(event.target.value)}
            className={fieldClass}
          >
            {MOVEMENT_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="quantity" className="block text-sm font-medium">
            Quantidade
          </label>
          <input
            id="quantity"
            name="quantity"
            inputMode="decimal"
            required
            placeholder="1,5"
            className={fieldClass}
          />
          {state.fieldErrors?.quantity ? (
            <p className="mt-1 text-xs text-red-700">{state.fieldErrors.quantity}</p>
          ) : null}
        </div>

        {movementType === "ADJUSTMENT" ? (
          <div>
            <label htmlFor="adjustmentDirection" className="block text-sm font-medium">
              Direção do ajuste
            </label>
            <select
              id="adjustmentDirection"
              name="adjustmentDirection"
              defaultValue="INCREASE"
              className={fieldClass}
            >
              <option value="INCREASE">Aumentar o saldo</option>
              <option value="DECREASE">Reduzir o saldo</option>
            </select>
            {state.fieldErrors?.adjustmentDirection ? (
              <p className="mt-1 text-xs text-red-700">
                {state.fieldErrors.adjustmentDirection}
              </p>
            ) : null}
          </div>
        ) : null}

        {movementType === "IN" ? (
          <div>
            <label htmlFor="unitCost" className="block text-sm font-medium">
              Custo unitário (opcional)
            </label>
            <input
              id="unitCost"
              name="unitCost"
              inputMode="decimal"
              placeholder="4,50"
              className={fieldClass}
            />
            {state.fieldErrors?.unitCost ? (
              <p className="mt-1 text-xs text-red-700">{state.fieldErrors.unitCost}</p>
            ) : null}
            <p className="mt-1 text-xs text-ink-muted">
              Em branco, usa o custo cadastrado no insumo.
            </p>
          </div>
        ) : null}
      </div>

      <div>
        <label htmlFor="reason" className="block text-sm font-medium">
          Motivo {needsReason ? "(obrigatório)" : "(opcional)"}
        </label>
        <textarea
          id="reason"
          name="reason"
          rows={2}
          maxLength={300}
          className={fieldClass}
          placeholder={
            movementType === "LOSS"
              ? "Ex.: produto vencido na câmara fria"
              : movementType === "ADJUSTMENT"
                ? "Ex.: contagem física de fim de mês"
                : "Ex.: compra do fornecedor"
          }
        />
        {state.fieldErrors?.reason ? (
          <p className="mt-1 text-xs text-red-700">{state.fieldErrors.reason}</p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "Registrando…" : "Registrar movimento"}
      </button>
    </form>
  );
}
