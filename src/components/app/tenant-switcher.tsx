"use client";

import { switchTenantAction } from "@/modules/tenants/actions";

type Option = { tenantId: string; tradeName: string };

export function TenantSwitcher({
  options,
  currentTenantId,
}: {
  options: Option[];
  currentTenantId: string;
}) {
  if (options.length < 2) return null;

  return (
    <form action={switchTenantAction}>
      <label htmlFor="tenant-switcher" className="sr-only">
        Estabelecimento ativo
      </label>
      <select
        id="tenant-switcher"
        name="tenantId"
        defaultValue={currentTenantId}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="rounded-lg border border-black/15 bg-white px-2 py-1 text-sm text-ink"
      >
        {options.map((option) => (
          <option key={option.tenantId} value={option.tenantId}>
            {option.tradeName}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="ml-2 text-xs text-brand-700">
          Trocar
        </button>
      </noscript>
    </form>
  );
}
