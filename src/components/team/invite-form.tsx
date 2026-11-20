"use client";

import { useActionState } from "react";
import { inviteMemberAction, type TeamState } from "@/modules/members/actions";
import { CopyLinkButton } from "@/components/catalog/copy-link-button";

const initialState: TeamState = {};

const fieldClass =
  "mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand-600";

export function InviteForm() {
  const [state, formAction, pending] = useActionState(inviteMemberAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <div>
          <label htmlFor="invite-email" className="block text-sm font-medium">
            E-mail
          </label>
          <input
            id="invite-email"
            name="email"
            type="email"
            required
            className={fieldClass}
          />
          {state.fieldErrors?.email ? (
            <p className="mt-1 text-xs text-red-700">{state.fieldErrors.email}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="invite-role" className="block text-sm font-medium">
            Perfil
          </label>
          <select id="invite-role" name="role" defaultValue="STAFF" className={fieldClass}>
            <option value="STAFF">Equipe</option>
            <option value="MANAGER">Gerente</option>
          </select>
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "Gerando convite…" : "Gerar convite"}
      </button>

      {state.success ? (
        <div className="space-y-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
          <p role="status">{state.success}</p>
          {state.inviteUrl ? (
            <div className="space-y-2">
              <code className="block break-all rounded bg-white/70 p-2 text-xs">
                {state.inviteUrl}
              </code>
              <CopyLinkButton
                url={state.inviteUrl}
                label="Copiar link do convite"
                copiedLabel="Link copiado"
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
