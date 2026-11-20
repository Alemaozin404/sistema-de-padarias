import { redirect } from "next/navigation";
import { AuthError, requireTenant } from "@/lib/auth";
import { RedeemForms } from "@/components/promotions/redeem-forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Resgatar código" };

export default async function RedeemCodePage() {
  try {
    await requireTenant();
  } catch (error) {
    if (error instanceof AuthError) redirect("/login");
    throw error;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 py-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">Benefícios</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink">Resgatar código</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Insira um cupom ou uma chave secreta para liberar descontos ou assinaturas.
        </p>
      </div>

      <RedeemForms />
    </div>
  );
}
