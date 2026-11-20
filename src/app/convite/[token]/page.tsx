import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getInvitationPreview } from "@/modules/members/queries";
import { isInvitationTokenShape, isInvitationUsable } from "@/modules/members/token";
import { AcceptInviteForm } from "@/components/team/accept-invite-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Convite" };

const ROLE_LABEL: Record<string, string> = {
  OWNER: "Proprietário",
  MANAGER: "Gerente",
  STAFF: "Equipe",
};

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (!isInvitationTokenShape(token)) {
    return (
      <main className="mx-auto max-w-md px-6 py-24">
        <h1 className="text-xl font-semibold">Convite inválido</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Este link não é válido. Peça um novo convite a quem administra o estabelecimento.
        </p>
      </main>
    );
  }

  let preview = null;
  let databaseUnavailable = false;
  try {
    preview = await getInvitationPreview(token);
  } catch {
    databaseUnavailable = true;
  }

  const session = await getSession().catch(() => null);

  if (databaseUnavailable) {
    return (
      <main className="mx-auto max-w-md px-6 py-24">
        <h1 className="text-xl font-semibold">Não foi possível abrir o convite</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Esta instalação está sem banco de dados configurado. Tente novamente mais tarde.
        </p>
      </main>
    );
  }

  if (!preview) {
    return (
      <main className="mx-auto max-w-md px-6 py-24">
        <h1 className="text-xl font-semibold">Convite não encontrado</h1>
        <p className="mt-2 text-sm text-ink-muted">
          O link pode ter expirado, sido cancelado ou já utilizado. Peça um novo convite.
        </p>
      </main>
    );
  }

  const usable = isInvitationUsable(preview);
  const emailMatches =
    !!session?.user && session.user.email.toLowerCase() === preview.email.toLowerCase();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <Link href="/" className="text-sm text-ink-muted hover:text-brand-700">
        ← Gestão para padarias
      </Link>

      <h1 className="mt-6 font-display text-2xl font-bold tracking-tight text-ink">
        Convite para {preview.tenantName}
      </h1>
      <p className="mt-2 text-sm text-ink-muted">
        Perfil oferecido: <strong>{ROLE_LABEL[preview.role] ?? preview.role}</strong> · e-mail
        convidado: <strong>{preview.email}</strong>
      </p>

      <div className="mt-8 space-y-4">
        {!usable ? (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            {preview.acceptedAt
              ? "Este convite já foi utilizado. Se você já faz parte da equipe, entre normalmente."
              : "Este convite expirou. Peça um novo a quem administra o estabelecimento."}
          </p>
        ) : !session?.user ? (
          <>
            <p className="text-sm text-ink-muted">
              Entre ou crie sua conta com o e-mail <strong>{preview.email}</strong> para aceitar.
            </p>
            <div className="flex gap-3">
              <Link
                href="/login"
                className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
              >
                Entrar
              </Link>
              <Link
                href="/cadastro"
                className="rounded-lg border border-border px-4 py-2.5 text-sm hover:border-brand-600"
              >
                Criar conta
              </Link>
            </div>
          </>
        ) : !emailMatches ? (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            Você está conectado como <strong>{session.user.email}</strong>. Este convite é para{" "}
            <strong>{preview.email}</strong>. Saia e entre com a conta convidada para aceitar.
          </p>
        ) : (
          <AcceptInviteForm token={token} />
        )}
      </div>
    </main>
  );
}
