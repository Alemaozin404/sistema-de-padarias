import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth/password-reset-forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nova senha" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <Link href="/login" className="text-sm text-ink-muted hover:text-brand-700">
        ← Voltar para o login
      </Link>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Criar nova senha</h1>

      {error ? (
        <div className="mt-6 space-y-4">
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            Este link de redefinição é inválido ou expirou.
          </p>
          <Link
            href="/esqueci-senha"
            className="inline-block rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            Solicitar novo link
          </Link>
        </div>
      ) : token ? (
        <div className="mt-8">
          <ResetPasswordForm token={token} />
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <p className="text-sm text-ink-muted">
            Abra esta página pelo link enviado ao seu e-mail. Se o link expirou, solicite outro.
          </p>
          <Link
            href="/esqueci-senha"
            className="inline-block rounded-lg border border-black/15 px-4 py-2.5 text-sm hover:border-brand-600"
          >
            Solicitar novo link
          </Link>
        </div>
      )}
    </div>
  );
}
