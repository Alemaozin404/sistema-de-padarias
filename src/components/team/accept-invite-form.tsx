"use client";

import { useActionState } from "react";
import { acceptInvitationAction, type AcceptInviteState } from "@/modules/members/actions";

const initialState: AcceptInviteState = {};

export function AcceptInviteForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(acceptInvitationAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      {state.error ? (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "Aceitando…" : "Aceitar convite"}
      </button>

      <p className="text-xs text-ink-muted">
        Ao aceitar, você passa a acessar os dados deste estabelecimento conforme o perfil
        indicado. Nenhum dado de outros clientes fica visível.
      </p>
    </form>
  );
}
