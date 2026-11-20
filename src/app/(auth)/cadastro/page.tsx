import Link from "next/link";
import { SignupForm } from "@/components/auth/signup-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Criar conta" };

export default async function CadastroPage({
  searchParams,
}: {
  searchParams: Promise<{ plano?: string }>;
}) {
  const { plano } = await searchParams;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <Link href="/" className="text-sm text-ink-muted hover:text-brand-700">
        ← Voltar ao site
      </Link>
      <h1 className="mt-6 font-display text-2xl font-bold tracking-tight text-ink">Cadastrar sua padaria</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Um estabelecimento, seus próprios dados e usuários. Leva alguns minutos.
      </p>
      <div className="mt-8">
        <SignupForm defaultPlan={plano ?? "ESSENCIAL"} />
      </div>
      <p className="mt-6 text-sm text-ink-muted">
        Já tem conta?{" "}
        <Link href="/login" className="font-medium text-brand-700 hover:underline">
          Entrar
        </Link>
      </p>
    </div>
  );
}
