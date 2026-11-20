"use client";

import { useActionState } from "react";
import { saveCategoryAction, type CatalogState } from "@/modules/catalog/actions";

const initialState: CatalogState = {};

export function CategoryForm() {
  const [state, formAction, pending] = useActionState(saveCategoryAction, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-start gap-2">
      <div>
        <label htmlFor="category-name" className="sr-only">
          Nova categoria
        </label>
        <input
          id="category-name"
          name="name"
          required
          placeholder="Nova categoria (ex.: Pães)"
          className="rounded-lg border border-border px-3 py-2 text-sm"
        />
        {state.fieldErrors?.name ? (
          <p className="mt-1 text-xs text-red-700">{state.fieldErrors.name}</p>
        ) : null}
        {state.error ? <p className="mt-1 text-xs text-red-700">{state.error}</p> : null}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:border-brand-600 disabled:opacity-60"
      >
        {pending ? "Criando…" : "Criar categoria"}
      </button>
    </form>
  );
}
