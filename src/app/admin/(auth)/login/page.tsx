import { redirect } from "next/navigation";
import { PlatformLoginForm } from "@/components/platform/login-form";
import { getPlatformSession, isMfaComplete } from "@/lib/platform-auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Painel da plataforma" };

export default async function PlatformLoginPage() {
  try {
    const session = await getPlatformSession();
    if (session) redirect(isMfaComplete(session) ? "/admin" : "/admin/2fa");
  } catch {
    // Sem banco configurado a página ainda precisa abrir.
  }

  return (
    <>
      <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-ink">Acesso restrito</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Painel exclusivo do proprietário da plataforma. Sessão separada do painel das
        padarias e protegida por dois fatores.
      </p>
      <div className="mt-8">
        <PlatformLoginForm />
      </div>
    </>
  );
}
