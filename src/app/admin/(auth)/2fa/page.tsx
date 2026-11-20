import { redirect } from "next/navigation";
import { PlatformTotpForm } from "@/components/platform/totp-form";
import { platformLogoutAction } from "@/modules/platform/auth-actions";
import { ensureTotpSecret } from "@/modules/platform/auth-service";
import { getPlatformSession, isMfaComplete } from "@/lib/platform-auth";
import { otpauthUrl } from "@/modules/platform/totp";
import QRCode from "qrcode";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dois fatores" };

export default async function PlatformTwoFactorPage() {
  const session = await getPlatformSession();
  if (!session) redirect("/admin/login");
  if (isMfaComplete(session)) redirect("/admin");

  const secret = await ensureTotpSecret(session.userId, session.totpSecret);
  const uri = otpauthUrl({ secret, email: session.email });
  const grouped = secret.replace(/(.{4})/g, "$1 ").trim();
  const qrCodeDataUrl = await QRCode.toDataURL(uri, { width: 220, margin: 1 });

  return (
    <>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Confirme o segundo fator</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Abra seu aplicativo autenticador e adicione a chave abaixo. O código muda a cada
        30 segundos.
      </p>

      {!session.totpEnabledAt ? (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">Primeiro acesso: cadastre esta chave</p>
          <p className="mt-2 text-xs">
            Digite a chave no aplicativo sem espaços. Agrupada apenas para leitura.
          </p>
          <code className="mt-2 block break-all rounded-lg bg-white/70 p-3 font-mono text-base tracking-wider">
            {secret}
          </code>
          <p className="mt-2 break-all font-mono text-xs text-amber-800">{grouped}</p>
          <div className="mt-3 flex justify-center rounded-lg bg-white p-3">
            <img src={qrCodeDataUrl} alt="QR code para cadastro do 2FA" width={220} height={220} />
          </div>
          <p className="mt-2 break-all text-xs text-amber-800">{uri}</p>
          <p className="mt-2 text-xs">
            Guarde a chave em local seguro. Sem ela e sem os códigos futuros, o acesso
            exige redefinição no banco.
          </p>
        </div>
      ) : null}

      <div className="mt-6">
        <PlatformTotpForm />
      </div>

      <form action={platformLogoutAction} className="mt-6">
        <button type="submit" className="text-sm text-ink-muted hover:text-brand-700">
          Sair deste acesso
        </button>
      </form>
    </>
  );
}
