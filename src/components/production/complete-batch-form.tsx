"use client";

import { useActionState, useState } from "react";
import { completeBatchAction, type ProductionState } from "@/modules/production/actions";

const initialState: ProductionState = {};

type Props = {
  batchId: string;
  plannedQuantity: string;
};

const fieldClass =
  "mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm focus:border-brand-600";

export function CompleteBatchForm({ batchId, plannedQuantity }: Props) {
  const [state, formAction, pending] = useActionState(completeBatchAction, initialState);
  const [lossQuantity, setLossQuantity] = useState("0");

  const hasLoss = Number(lossQuantity.replace(",", ".")) > 0;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="batchId" value={batchId} />

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
          <label htmlFor="producedQuantity" className="block text-sm font-medium">
            Unidades boas produzidas
          </label>
          <input
            id="producedQuantity"
            name="producedQuantity"
            inputMode="decimal"
            required
            defaultValue={String(Number(plannedQuantity))}
            className={fieldClass}
          />
          {state.fieldErrors?.producedQuantity ? (
            <p className="mt-1 text-xs text-red-700">{state.fieldErrors.producedQuantity}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="lossQuantity" className="block text-sm font-medium">
            Perdas (unidades)
          </label>
          <input
            id="lossQuantity"
            name="lossQuantity"
            inputMode="decimal"
            value={lossQuantity}
            onChange={(event) => setLossQuantity(event.target.value)}
            className={fieldClass}
          />
          {state.fieldErrors?.lossQuantity ? (
            <p className="mt-1 text-xs text-red-700">{state.fieldErrors.lossQuantity}</p>
          ) : null}
          <p className="mt-1 text-xs text-ink-muted">
            A perda também consome insumo e entra no custo real.
          </p>
        </div>
      </div>

      {hasLoss ? (
        <div>
          <label htmlFor="lossReason" className="block text-sm font-medium">
            Motivo da perda
          </label>
          <input
            id="lossReason"
            name="lossReason"
            maxLength={300}
            required
            placeholder="Ex.: assou demais / caiu no transporte"
            className={fieldClass}
          />
          {state.fieldErrors?.lossReason ? (
            <p className="mt-1 text-xs text-red-700">{state.fieldErrors.lossReason}</p>
          ) : null}
        </div>
      ) : (
        <input type="hidden" name="lossReason" value="" />
      )}

      <p className="rounded-lg bg-black/[0.03] p-3 text-xs text-ink-muted">
        Ao concluir, os insumos da ficha são consumidos pelo fator (produzidas + perdas) ÷
        rendimento, o produto acabado entra no estoque e o custo por unidade é gravado no lote.
        Se faltar insumo, nada é alterado.
      </p>

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "Concluindo…" : "Concluir fornada"}
      </button>
    </form>
  );
}
