"use client";

import { useActionState } from "react";
import { signupAction, type SignupState } from "@/modules/tenants/actions";

const initialState: SignupState = {};

const PLANS = [
  { code: "ESSENCIAL", label: "Essencial" },
  { code: "PROFISSIONAL", label: "Profissional" },
  { code: "EMPRESARIAL", label: "Empresarial" },
] as const;

const fieldClass =
  "mt-1 w-full rounded-lg border border-border px-3 py-2";

export function SignupForm({ defaultPlan }: { defaultPlan: string }) {
  const [state, formAction, pending] = useActionState(signupAction, initialState);
  const selected = PLANS.some((plan) => plan.code === defaultPlan) ? defaultPlan : "ESSENCIAL";

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      <div>
        <label htmlFor="tradeName" className="block text-sm font-medium">
          Nome da padaria
        </label>
        <input id="tradeName" name="tradeName" required className={fieldClass} />
        {state.fieldErrors?.tradeName ? (
          <p className="mt-1 text-xs text-red-600">{state.fieldErrors.tradeName}</p>
        ) : null}
      </div>

      <div>
        <label htmlFor="slug" className="block text-sm font-medium">
          Endereço da vitrine
        </label>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-sm text-ink-muted">/</span>
          <input
            id="slug"
            name="slug"
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            placeholder="padaria-central"
            className="w-full rounded-lg border border-border px-3 py-2"
          />
        </div>
        {state.fieldErrors?.slug ? (
          <p className="mt-1 text-xs text-red-600">{state.fieldErrors.slug}</p>
        ) : (
          <p className="mt-1 text-xs text-ink-muted">
            Letras minúsculas, números e hífen. Será o link público da sua vitrine.
          </p>
        )}
      </div>

      <div>
        <label htmlFor="ownerName" className="block text-sm font-medium">
          Seu nome
        </label>
        <input id="ownerName" name="ownerName" required className={fieldClass} />
        {state.fieldErrors?.ownerName ? (
          <p className="mt-1 text-xs text-red-600">{state.fieldErrors.ownerName}</p>
        ) : null}
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium">
          E-mail
        </label>
        <input id="email" name="email" type="email" required className={fieldClass} />
        {state.fieldErrors?.email ? (
          <p className="mt-1 text-xs text-red-600">{state.fieldErrors.email}</p>
        ) : null}
      </div>

      <div>
        <label htmlFor="whatsapp" className="block text-sm font-medium">
          WhatsApp (opcional)
        </label>
        <input
          id="whatsapp"
          name="whatsapp"
          inputMode="numeric"
          placeholder="11999998888"
          className={fieldClass}
        />
        {state.fieldErrors?.whatsapp ? (
          <p className="mt-1 text-xs text-red-600">{state.fieldErrors.whatsapp}</p>
        ) : null}
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium">
          Senha
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          className={fieldClass}
        />
        {state.fieldErrors?.password ? (
          <p className="mt-1 text-xs text-red-600">{state.fieldErrors.password}</p>
        ) : (
          <p className="mt-1 text-xs text-ink-muted">Mínimo de 12 caracteres.</p>
        )}
      </div>

      <div>
        <label htmlFor="planCode" className="block text-sm font-medium">
          Plano
        </label>
        <select id="planCode" name="planCode" defaultValue={selected} className={fieldClass}>
          {PLANS.map((plan) => (
            <option key={plan.code} value={plan.code}>
              {plan.label}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "Criando conta…" : "Criar conta e estabelecimento"}
      </button>

      <p className="text-xs text-ink-muted">
        A conta é criada com assinatura pendente. O painel operacional é liberado após a
        confirmação do primeiro pagamento.
      </p>
    </form>
  );
}
