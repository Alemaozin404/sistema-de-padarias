"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/modules/auth/actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      <div>
        <label htmlFor="email" className="block text-sm font-medium">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium">
          Senha
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
