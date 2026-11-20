import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { withPlatformAdmin } from "@/lib/db";
import { getPlatformSession } from "@/lib/platform-auth";
import { listAuditLogs, listTenantOptions } from "@/modules/platform/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Atividades" };

function dateLabel(value: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(value);
}

export default async function PlatformActivitiesPage({ searchParams }: { searchParams: Promise<{ tenant?: string; q?: string }> }) {
  const session = await getPlatformSession();
  if (!session) redirect("/admin/login");
  const params = await searchParams;
  const tenantFilter = params.tenant && z.uuid().safeParse(params.tenant).success ? params.tenant : undefined;
  const [logs, tenants] = await Promise.all([
    withPlatformAdmin(session.userId, (tx) => listAuditLogs(tx, { tenantId: tenantFilter, limit: 300 })),
    listTenantOptions(),
  ]);
  const q = params.q?.trim().toLowerCase();
  const filtered = q ? logs.filter((log) => log.action.toLowerCase().includes(q) || log.entityType.toLowerCase().includes(q)) : logs;
  const tenantNames = new Map(tenants.map((tenant) => [tenant.id, tenant.tradeName]));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">MASTER CONTROL</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Atividades</h1>
        <p className="mt-1 text-sm text-ink-muted">Linha do tempo de eventos operacionais, financeiros e administrativos.</p>
      </div>

      <form className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="tenant" className="block text-xs text-ink-muted">Cliente</label>
          <select id="tenant" name="tenant" defaultValue={tenantFilter ?? ""} className="mt-1 rounded-lg border border-black/15 px-3 py-2 text-sm">
            <option value="">Todos</option>
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>{tenant.tradeName}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="q" className="block text-xs text-ink-muted">Buscar ação/entidade</label>
          <input id="q" name="q" defaultValue={params.q ?? ""} className="mt-1 rounded-lg border border-black/15 px-3 py-2 text-sm" />
        </div>
        <button type="submit" className="rounded-lg border border-black/15 px-3 py-2 text-sm font-medium hover:bg-black/5">Filtrar</button>
      </form>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-black/10 bg-white p-5 text-sm text-ink-muted">Nenhum evento encontrado.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-black/10 bg-white">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="border-b border-black/10 text-left text-xs uppercase tracking-wider text-ink-muted">
              <tr>
                <th className="px-4 py-3">Quando</th>
                <th className="px-4 py-3">Ator</th>
                <th className="px-4 py-3">Ação</th>
                <th className="px-4 py-3">Entidade</th>
                <th className="px-4 py-3">Cliente</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((log) => (
                <tr key={log.id} className="border-b border-black/5 align-top last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 text-xs">{dateLabel(log.createdAt)}</td>
                  <td className="px-4 py-3 text-xs">{log.actorType}<br /><span className="text-ink-muted">{log.actorId ?? "—"}</span></td>
                  <td className="px-4 py-3 font-mono text-xs">{log.action}</td>
                  <td className="px-4 py-3 text-xs">{log.entityType}<br /><span className="text-ink-muted">{log.entityId?.slice(0, 8) ?? "—"}</span></td>
                  <td className="px-4 py-3 text-xs">{log.tenantId ? tenantNames.get(log.tenantId) ?? log.tenantId.slice(0, 8) : "global"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
