"use client";

import { useActionState } from "react";
import {
  platformTotpAction,
  type PlatformTotpState,
} from "@/modules/platform/auth-actions";

const initialState: PlatformTotpState = {};

export function PlatformTotpForm() {
  const [state, formAction, pending] = useActionState(platformTotpAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      <div>
        <label htmlFor="code" className="block text-sm font-medium">
          Código de 6 dígitos
        </label>
        <input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          maxLength={7}
          required
          autoFocus
          className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-center text-xl tracking-[0.4em]"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "Confirmando…" : "Confirmar código"}
      </button>
    </form>
  );
}
