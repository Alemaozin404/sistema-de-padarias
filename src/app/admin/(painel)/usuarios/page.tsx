import Link from "next/link";
import { listPlatformUsers } from "@/modules/platform/queries";
import { formatBRL } from "@/modules/shared/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "Usuários" };

export default async function PlatformUsersPage() {
  const users = await listPlatformUsers();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">MASTER CONTROL</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Usuários</h1>
        <p className="mt-1 text-sm text-ink-muted">{users.length} conta(s) cadastrada(s).</p>
      </div>
      <a href="/api/admin/export?kind=users" className="inline-block rounded-lg border border-black/15 px-3 py-2 text-sm font-medium hover:bg-black/5">
        Exportar CSV
      </a>

      <div className="overflow-x-auto rounded-xl border border-black/10 bg-white">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-black/10 text-left text-xs uppercase tracking-wider text-ink-muted">
            <tr>
              <th className="px-4 py-3">Usuário</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">E-mail verificado</th>
              <th className="px-4 py-3">Cadastros</th>
              <th className="px-4 py-3">Sessões ativas</th>
              <th className="px-4 py-3">Último login</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-black/5 last:border-0">
                <td className="px-4 py-3">
                  <p className="font-medium">{user.name}</p>
                  <p className="text-xs text-ink-muted">{user.email}</p>
                </td>
                <td className="px-4 py-3">{user.status}</td>
                <td className="px-4 py-3">{user.emailVerified ? "sim" : "não"}</td>
                <td className="px-4 py-3">
                  {user.memberships.length === 0 ? "—" : user.memberships.map((m) => m.tradeName).join(", ")}
                </td>
                <td className="px-4 py-3">{user.activeSessions}</td>
                <td className="px-4 py-3 text-xs">
                  {user.lastLoginAt ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(user.lastLoginAt) : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/admin/usuarios/${user.id}`} className="text-xs text-brand-700 hover:underline">
                    Detalhes
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
