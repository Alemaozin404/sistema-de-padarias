import { redirect } from "next/navigation";
import { AuthError, requireTenant } from "@/lib/auth";
import { loadEntitlements } from "@/modules/billing/queries";
import { limitOf } from "@/modules/plans/entitlements";
import {
  changeMemberRoleAction,
  disableMemberAction,
  revokeInvitationAction,
} from "@/modules/members/actions";
import {
  countSeatsUsed,
  listMembers,
  listPendingInvitations,
} from "@/modules/members/queries";
import { InviteForm } from "@/components/team/invite-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Equipe" };

const ROLE_LABEL: Record<string, string> = {
  OWNER: "Proprietário",
  MANAGER: "Gerente",
  STAFF: "Equipe",
};

export default async function TeamPage() {
  let membership;
  try {
    membership = await requireTenant();
  } catch (error) {
    if (error instanceof AuthError) redirect("/login");
    throw error;
  }

  const [members, invites, seats, loaded] = await Promise.all([
    listMembers(membership.tenantId),
    listPendingInvitations(membership.tenantId),
    countSeatsUsed(membership.tenantId),
    loadEntitlements(membership.tenantId),
  ]);

  const canInvite = membership.role === "OWNER" || membership.role === "MANAGER";
  const isOwner = membership.role === "OWNER";
  const limit = loaded ? limitOf(loaded.entitlements, "users.max") : null;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">Equipe</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink">Usuários do estabelecimento</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {seats} {seats === 1 ? "assento ocupado" : "assentos ocupados"}
          {limit !== null ? ` de ${limit} no plano` : " · sem limite no seu plano"}
          {invites.length > 0 ? ` · ${invites.length} convite(s) pendente(s)` : ""}
        </p>
      </div>

      {loaded?.entitlements.warning ? (
        <div
          role="status"
          className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
        >
          {loaded.entitlements.warning}
        </div>
      ) : null}

      {canInvite ? (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold">Convidar pessoa</h2>
          <p className="mt-1 text-xs text-ink-muted">
            O convite expira em 7 dias. Quem aceitar passa a acessar apenas este estabelecimento.
          </p>
          <div className="mt-4 max-w-2xl">
            <InviteForm />
          </div>
        </section>
      ) : null}

      {invites.length > 0 ? (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold">Convites pendentes</h2>
          <ul className="mt-3 divide-y divide-black/5">
            {invites.map((invite) => (
              <li key={invite.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  {invite.email}{" "}
                  <span className="text-xs text-ink-muted">
                    · {ROLE_LABEL[invite.role] ?? invite.role} · expira em{" "}
                    {invite.expiresAt.toLocaleDateString("pt-BR")}
                  </span>
                </span>
                {canInvite ? (
                  <form action={revokeInvitationAction}>
                    <input type="hidden" name="invitationId" value={invite.id} />
                    <button
                      type="submit"
                      className="text-xs text-ink-muted hover:text-red-700"
                    >
                      Cancelar convite
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-muted">
            O link do convite é exibido apenas no momento da criação. Se precisar de um novo,
            cancele e crie outro.
          </p>
        </section>
      ) : null}

      <section className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-sunken text-left text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Pessoa</th>
              <th className="px-4 py-3 font-medium">Perfil</th>
              <th className="px-4 py-3 font-medium">Situação</th>
              <th className="px-4 py-3 font-medium sr-only">Ações</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id} className="border-t border-border">
                <td className="px-4 py-3">
                  <p className="font-medium">{member.name}</p>
                  <p className="text-xs text-ink-muted">{member.email}</p>
                </td>
                <td className="px-4 py-3">
                  {isOwner && member.role !== "OWNER" ? (
                    <form action={changeMemberRoleAction} className="flex items-center gap-2">
                      <input type="hidden" name="memberId" value={member.id} />
                      <select
                        name="role"
                        defaultValue={member.role}
                        className="rounded-lg border border-border px-2 py-1 text-xs"
                      >
                        <option value="STAFF">Equipe</option>
                        <option value="MANAGER">Gerente</option>
                      </select>
                      <button type="submit" className="text-xs text-brand-700 hover:underline">
                        Salvar
                      </button>
                    </form>
                  ) : (
                    (ROLE_LABEL[member.role] ?? member.role)
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={
                      member.status === "ACTIVE"
                        ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700"
                        : "rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600"
                    }
                  >
                    {member.status === "ACTIVE" ? "Ativo" : "Desativado"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {isOwner && member.role !== "OWNER" && member.status === "ACTIVE" ? (
                    <form action={disableMemberAction}>
                      <input type="hidden" name="memberId" value={member.id} />
                      <button
                        type="submit"
                        className="text-xs text-ink-muted hover:text-red-700"
                      >
                        Desativar acesso
                      </button>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="text-xs text-ink-muted">
        Desativar um usuário revoga o acesso ao painel, mas não apaga o histórico que ele gerou.
      </p>
    </div>
  );
}
