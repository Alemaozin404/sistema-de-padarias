"use client";

import { useActionState } from "react";
import {
  platformReauthAction,
  type ReauthState,
} from "@/modules/platform/auth-actions";

const initialState: ReauthState = {};

export function PlatformReauthForm({ fresh }: { fresh: boolean }) {
  const [state, formAction, pending] = useActionState(platformReauthAction, initialState);

  if (fresh && !state.error && !state.success) {
    return (
      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
        Reautenticado
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <form action={formAction} className="flex items-center gap-2">
        <label htmlFor="reauth-password" className="sr-only">
          Senha para reautenticar
        </label>
        <input
          id="reauth-password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder={state.error ?? "Senha para ações sensíveis"}
          required
          className="w-52 rounded-lg border border-border px-3 py-1.5 text-xs"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-black/5 disabled:opacity-60"
        >
          {pending ? "…" : "Reautenticar"}
        </button>
      </form>
      {state.success ? (
        <span role="status" className="text-xs text-emerald-700">
          {state.success}
        </span>
      ) : null}
    </div>
  );
}
