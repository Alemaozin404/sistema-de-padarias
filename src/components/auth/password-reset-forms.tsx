"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  requestPasswordResetAction,
  resetPasswordAction,
  type PasswordResetRequestState,
  type PasswordResetState,
} from "@/modules/auth/actions";

const requestInitial: PasswordResetRequestState = {};
const resetInitial: PasswordResetState = {};

const fieldClass =
  "mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand-600";

export function RequestPasswordResetForm() {
  const [state, formAction, pending] = useActionState(
    requestPasswordResetAction,
    requestInitial,
  );

  return (
    <form action={formAction} className="space-y-4">
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
        <label htmlFor="reset-email" className="block text-sm font-medium">
          E-mail da conta
        </label>
        <input
          id="reset-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className={fieldClass}
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "Enviando…" : "Enviar link de redefinição"}
      </button>

      <p className="text-sm text-ink-muted">
        <Link href="/login" className="font-medium text-brand-700 hover:underline">
          Voltar para o login
        </Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, resetInitial);

  if (state.success) {
    return (
      <div className="space-y-4">
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          {state.success}
        </p>
        <Link
          href="/login"
          className="inline-block rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          Entrar com a nova senha
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      {state.error ? (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      <div>
        <label htmlFor="new-password" className="block text-sm font-medium">
          Nova senha
        </label>
        <input
          id="new-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          className={fieldClass}
        />
        <p className="mt-1 text-xs text-ink-muted">Mínimo de 12 caracteres.</p>
      </div>

      <div>
        <label htmlFor="confirm-password" className="block text-sm font-medium">
          Confirme a nova senha
        </label>
        <input
          id="confirm-password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          className={fieldClass}
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "Salvando…" : "Definir nova senha"}
      </button>

      <p className="text-sm text-ink-muted">
        Link expirado?{" "}
        <Link href="/esqueci-senha" className="font-medium text-brand-700 hover:underline">
          Solicitar outro
        </Link>
      </p>
    </form>
  );
}
