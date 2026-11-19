"use client";

import { useActionState } from "react";
import {
  createChargeAction,
  reconcileInvoiceAction,
  startCheckoutAction,
  type BillingActionState,
} from "@/modules/billing/actions";

const initialState: BillingActionState = {};

const fieldClass =
  "mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm focus:border-brand-600";

function Feedback({ state }: { state: BillingActionState }) {
  return (
    <>
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
    </>
  );
}

function DocumentField({ hint }: { hint: string }) {
  return (
    <div>
      <label htmlFor="document" className="block text-sm font-medium">
        CPF ou CNPJ do estabelecimento
      </label>
      <input
        id="document"
        name="document"
        inputMode="numeric"
        placeholder="Somente números"
        className={fieldClass}
      />
      <p className="mt-1 text-xs text-ink-muted">{hint}</p>
    </div>
  );
}

export function CheckoutForm() {
  const [state, formAction, pending] = useActionState(startCheckoutAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <Feedback state={state} />

      <DocumentField hint="Obrigatório se o estabelecimento ainda não tiver CPF/CNPJ cadastrado." />

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "Gerando cobrança…" : "Gerar cobrança Pix"}
      </button>
    </form>
  );
}

export function ChargeForm({ invoiceId }: { invoiceId: string }) {
  const [state, formAction, pending] = useActionState(createChargeAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <Feedback state={state} />
      <DocumentField hint="Preencha apenas se o documento ainda não estiver cadastrado." />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "Gerando cobrança…" : "Gerar cobrança Pix desta fatura"}
      </button>
    </form>
  );
}

export function ReconcileForm({ invoiceId }: { invoiceId: string }) {
  const [state, formAction, pending] = useActionState(reconcileInvoiceAction, initialState);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <Feedback state={state} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-brand-600 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-60"
      >
        {pending ? "Consultando…" : "Já paguei — consultar gateway"}
      </button>
      <p className="text-xs text-ink-muted">
        O botão consulta a cobrança no gateway. A confirmação também chega pelo webhook;
        este é o caminho de contingência.
      </p>
    </form>
  );
}
