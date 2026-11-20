import { redirect } from "next/navigation";
import { z } from "zod";
import { withPlatformAdmin } from "@/lib/db";
import { getPlatformSession } from "@/lib/platform-auth";
import { listAuditLogs, listTenantOptions } from "@/modules/platform/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Auditoria" };

function dateLabel(value: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(value);
}

function shortJson(value: unknown): string {
  if (value === null || value === undefined) return "—";
  const text = JSON.stringify(value);
  return text.length > 240 ? `${text.slice(0, 240)}…` : text;
}

export default async function PlatformAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string }>;
}) {
  const session = await getPlatformSession();
  if (!session) redirect("/admin/login");

  const params = await searchParams;
  const tenantFilter =
    params.tenant && z.uuid().safeParse(params.tenant).success ? params.tenant : undefined;
  const [logs, tenants] = await Promise.all([
    withPlatformAdmin(session.userId, (tx) =>
      listAuditLogs(tx, { tenantId: tenantFilter, limit: 200 }),
    ),
    listTenantOptions(),
  ]);
  const tenantNames = new Map(tenants.map((tenant) => [tenant.id, tenant.tradeName]));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">Plataforma</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink">Auditoria</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Trilha append-only das ações de plataforma e de clientes. Registros não podem ser
          editados nem apagados pela aplicação.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="tenant" className="block text-xs text-ink-muted">
            Filtrar por cliente
          </label>
          <select
            id="tenant"
            name="tenant"
            defaultValue={tenantFilter ?? ""}
            className="mt-1 rounded-lg border border-border px-3 py-2 text-sm"
          >
            <option value="">Todos</option>
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.tradeName}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-black/5"
        >
          Filtrar
        </button>
      </form>

      {logs.length === 0 ? (
        <p className="rounded-xl border border-border bg-white p-5 text-sm text-ink-muted">
          Nenhum registro de auditoria.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-white">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-ink-muted">
              <tr>
                <th className="px-4 py-3">Quando</th>
                <th className="px-4 py-3">Ator</th>
                <th className="px-4 py-3">Ação</th>
                <th className="px-4 py-3">Entidade</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Antes</th>
                <th className="px-4 py-3">Depois</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-border align-top last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 text-xs">{dateLabel(log.createdAt)}</td>
                  <td className="px-4 py-3 text-xs">
                    {log.actorType}
                    <br />
                    <span className="text-ink-muted">{log.actorId ?? "—"}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{log.action}</td>
                  <td className="px-4 py-3 text-xs">
                    {log.entityType}
                    <br />
                    <span className="text-ink-muted">{log.entityId?.slice(0, 8) ?? "—"}</span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {log.tenantId ? tenantNames.get(log.tenantId) ?? log.tenantId.slice(0, 8) : "global"}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-muted">{shortJson(log.before)}</td>
                  <td className="px-4 py-3 text-xs text-ink-muted">{shortJson(log.after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
