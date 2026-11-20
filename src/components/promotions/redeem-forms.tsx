"use client";

import { useActionState } from "react";
import { redeemCouponAction, redeemSecretKeyAction } from "@/modules/promotions/tenant-actions";

export function RedeemForms() {
  const [couponState, couponAction, couponPending] = useActionState(redeemCouponAction, {});
  const [keyState, keyAction, keyPending] = useActionState(redeemSecretKeyAction, {});

  return (
    <div className="space-y-6">
      <form action={couponAction} className="space-y-3 rounded-xl border border-border bg-white p-5">
        <h2 className="text-sm font-semibold">Cupom promocional</h2>
        {couponState.error ? <p className="text-sm text-red-700">{couponState.error}</p> : null}
        {couponState.success ? <p className="text-sm text-emerald-700">{couponState.success}</p> : null}
        <input name="code" required placeholder="PADARIA100" className="w-full rounded-lg border border-border px-3 py-2 text-sm uppercase" />
        <button type="submit" disabled={couponPending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">
          Aplicar cupom
        </button>
      </form>

      <form action={keyAction} className="space-y-3 rounded-xl border border-border bg-white p-5">
        <h2 className="text-sm font-semibold">Chave secreta</h2>
        {keyState.error ? <p className="text-sm text-red-700">{keyState.error}</p> : null}
        {keyState.success ? <p className="text-sm text-emerald-700">{keyState.success}</p> : null}
        <input name="code" required placeholder="PADARIA-XXXX-XXXX-XXXX" className="w-full rounded-lg border border-border px-3 py-2 text-sm uppercase" />
        <button type="submit" disabled={keyPending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">
          Ativar benefício
        </button>
      </form>
    </div>
  );
}