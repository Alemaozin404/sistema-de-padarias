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
        className="w-full rounded-lg border border-white/10 bg-white/[0.06] px-2 py-1.5 text-sm text-white focus:border-brand-400 focus:outline-none"
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
