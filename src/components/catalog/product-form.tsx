"use client";

import { useActionState } from "react";
import { saveProductAction, type CatalogState } from "@/modules/catalog/actions";
import { PRODUCT_UNITS } from "@/modules/catalog/rules";

const initialState: CatalogState = {};

type CategoryOption = { id: string; name: string };

type Props = {
  categories: CategoryOption[];
  product?: {
    id: string;
    name: string;
    description: string | null;
    priceCents: number;
    unit: string;
    categoryId: string | null;
    isAvailable: boolean;
  };
  submitLabel: string;
};

const fieldClass =
  "mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm focus:border-brand-600";

export function ProductForm({ categories, product, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(saveProductAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      {product ? <input type="hidden" name="id" value={product.id} /> : null}

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

      <div>
        <label htmlFor="name" className="block text-sm font-medium">
          Nome do produto
        </label>
        <input
          id="name"
          name="name"
          required
          defaultValue={product?.name ?? ""}
          className={fieldClass}
        />
        {state.fieldErrors?.name ? (
          <p className="mt-1 text-xs text-red-700">{state.fieldErrors.name}</p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="price" className="block text-sm font-medium">
            Preço (R$)
          </label>
          <input
            id="price"
            name="price"
            inputMode="decimal"
            required
            placeholder="12,50"
            defaultValue={
              product ? (product.priceCents / 100).toFixed(2).replace(".", ",") : ""
            }
            className={fieldClass}
          />
          {state.fieldErrors?.price ? (
            <p className="mt-1 text-xs text-red-700">{state.fieldErrors.price}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="unit" className="block text-sm font-medium">
            Unidade
          </label>
          <select
            id="unit"
            name="unit"
            defaultValue={product?.unit ?? "UN"}
            className={fieldClass}
          >
            {PRODUCT_UNITS.map((unit) => (
              <option key={unit.value} value={unit.value}>
                {unit.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="categoryId" className="block text-sm font-medium">
            Categoria
          </label>
          <select
            id="categoryId"
            name="categoryId"
            defaultValue={product?.categoryId ?? ""}
            className={fieldClass}
          >
            <option value="">Sem categoria</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          {state.fieldErrors?.categoryId ? (
            <p className="mt-1 text-xs text-red-700">{state.fieldErrors.categoryId}</p>
          ) : null}
        </div>
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium">
          Descrição (opcional)
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          maxLength={600}
          defaultValue={product?.description ?? ""}
          className={fieldClass}
        />
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="isAvailable"
          defaultChecked={product?.isAvailable ?? false}
          className="mt-0.5"
        />
        <span>
          Mostrar na vitrine pública
          <span className="block text-xs text-ink-muted">
            Produtos não publicados ficam só no catálogo interno.
          </span>
        </span>
      </label>

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
