import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Entrar" };

export default async function LoginPage() {
  // Sem banco configurado a consulta de sessão falha; a página ainda precisa abrir.
  try {
    const session = await getSession();
    if (session?.user) redirect("/dashboard");
  } catch {
    // segue para o formulário
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <Link href="/" className="text-sm text-ink-muted hover:text-brand-700">
        ← Voltar ao site
      </Link>
      <h1 className="font-display mt-6 text-3xl font-semibold tracking-tight text-ink">Entrar na plataforma</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Acesse o painel do seu estabelecimento.
      </p>
      <div className="glass-strong mt-8 rounded-3xl p-8">
        <LoginForm />
      </div>
      <p className="mt-4 text-sm">
        <Link href="/esqueci-senha" className="text-ink-muted hover:text-brand-700">
          Esqueci minha senha
        </Link>
      </p>
      <p className="mt-6 text-sm text-ink-muted">
        Ainda não tem conta?{" "}
        <Link href="/cadastro" className="font-medium text-brand-700 hover:underline">
          Cadastrar padaria
        </Link>
      </p>
    </div>
  );
}
