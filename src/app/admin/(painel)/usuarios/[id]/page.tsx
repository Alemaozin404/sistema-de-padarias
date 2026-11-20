import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlatformUserDetail } from "@/modules/platform/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Usuário" };

function dateLabel(value: Date | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(value);
}

export default async function PlatformUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getPlatformUserDetail(id);
  if (!detail) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/usuarios" className="text-sm text-ink-muted hover:text-brand-700">
          ← Usuários
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{detail.user.name}</h1>
        <p className="text-sm text-ink-muted">{detail.user.email} · {detail.user.status}</p>
      </div>

      <section className="rounded-xl border border-black/10 bg-white p-5">
        <h2 className="text-sm font-semibold">Vínculos com padarias</h2>
        {detail.memberships.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">Nenhum vínculo.</p>
        ) : (
          <ul className="mt-3 divide-y divide-black/5 text-sm">
            {detail.memberships.map((row) => (
              <li key={row.membership.id} className="flex items-center justify-between py-2">
                <span>{row.tenant.tradeName}</span>
                <span className="text-xs text-ink-muted">
                  {row.membership.role} · {row.membership.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-5">
        <h2 className="text-sm font-semibold">Sessões recentes</h2>
        {detail.sessions.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">Nenhuma sessão.</p>
        ) : (
          <ul className="mt-3 divide-y divide-black/5 text-xs">
            {detail.sessions.map((session) => (
              <li key={session.id} className="py-2">
                <p className="font-medium">{session.ipAddress ?? "IP não registrado"}</p>
                <p className="text-ink-muted">
                  {dateLabel(session.createdAt)} · {session.userAgent?.slice(0, 80) ?? "—"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-5">
        <h2 className="text-sm font-semibold">Auditoria do usuário</h2>
        {detail.audit.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">Nenhum registro.</p>
        ) : (
          <ul className="mt-3 divide-y divide-black/5 text-xs">
            {detail.audit.map((log) => (
              <li key={log.id} className="py-2">
                <p className="font-medium">{log.action}</p>
                <p className="text-ink-muted">
                  {dateLabel(log.createdAt)} · {log.entityType} · {log.tenantId ?? "global"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
