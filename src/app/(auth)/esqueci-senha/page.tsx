import Link from "next/link";
import { RequestPasswordResetForm } from "@/components/auth/password-reset-forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Recuperar senha" };

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <Link href="/login" className="text-sm text-ink-muted hover:text-brand-700">
        ← Voltar para o login
      </Link>
      <h1 className="mt-6 font-display text-2xl font-bold tracking-tight text-ink">Recuperar senha</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Informe o e-mail da sua conta. Enviaremos um link para você criar uma nova senha.
      </p>
      <div className="mt-8">
        <RequestPasswordResetForm />
      </div>
    </div>
  );
}
