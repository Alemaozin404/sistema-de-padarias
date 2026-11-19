import { redirect } from "next/navigation";
import { getPlatformSession } from "@/lib/platform-auth";
import { getSystemSnapshot } from "@/modules/platform/queries";
import { markRestoreTestedAction } from "@/modules/platform/system-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sistema" };

function dateLabel(value: Date | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(value);
}

const STATUS_STYLE: Record<string, string> = {
  UP: "bg-emerald-50 text-emerald-700",
  DEGRADED: "bg-amber-50 text-amber-700",
  DOWN: "bg-red-50 text-red-700",
  SUCCESS: "bg-emerald-50 text-emerald-700",
  FAILED: "bg-red-50 text-red-700",
  RUNNING: "bg-sky-50 text-sky-700",
};

export default async function PlatformSystemPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; ok?: string }>;
}) {
  const [params, session] = await Promise.all([searchParams, getPlatformSession()]);
  if (!session) redirect("/admin/login");
  const system = await getSystemSnapshot();
  const canAct = session.role === "OWNER";

  const latestByTarget = new Map<string, (typeof system.health)[number]>();
  for (const check of system.health) {
    if (!latestByTarget.has(check.target)) latestByTarget.set(check.target, check);
  }
  const lastBackup = system.backups[0] ?? null;
  const openIncidents = system.incidents.filter((incident) => incident.status !== "RESOLVED");
  const dbChecks = system.health.filter((check) => check.target === "DB");
  const dbUptime = dbChecks.length
    ? Math.round((dbChecks.filter((check) => check.status === "UP").length / dbChecks.length) * 100)
    : null;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">Plataforma</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Sistema</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Dependências, backups testados, falhas de webhook e incidentes. Backup sem restore
          testado não conta como proteção.
        </p>
      </div>

      {params.erro ? (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {params.erro}
        </p>
      ) : null}
      {params.ok ? (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
          {params.ok}
        </p>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {["DB", "GATEWAY", "EMAIL"].map((target) => {
          const check = latestByTarget.get(target);
          return (
            <div key={target} className="rounded-xl border border-black/10 bg-white p-5">
              <p className="text-xs uppercase tracking-wider text-ink-muted">{target}</p>
              <p className="mt-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    STATUS_STYLE[check?.status ?? ""] ?? "bg-neutral-100 text-neutral-600"
                  }`}
                >
                  {check?.status ?? "SEM CHECK"}
                </span>
              </p>
              <p className="mt-2 text-xs text-ink-muted">{check?.detail ?? "Nenhuma verificação registrada."}</p>
              <p className="mt-1 text-xs text-ink-muted">{dateLabel(check?.checkedAt ?? null)}</p>
            </div>
          );
        })}
        <div className="rounded-xl border border-black/10 bg-white p-5">
          <p className="text-xs uppercase tracking-wider text-ink-muted">Uptime DB</p>
          <p className="mt-2 text-2xl font-semibold">{dbUptime === null ? "—" : `${dbUptime}%`}</p>
          <p className="mt-1 text-xs text-ink-muted">{dbChecks.length} check(s) recentes</p>
        </div>
        <div className="rounded-xl border border-black/10 bg-white p-5">
          <p className="text-xs uppercase tracking-wider text-ink-muted">Incidentes abertos</p>
          <p className="mt-2 text-2xl font-semibold">{openIncidents.length}</p>
          <p className="mt-1 text-xs text-ink-muted">
            {lastBackup?.restoreTestedAt ? "último restore testado" : "restore não testado"}
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-5">
        <h2 className="text-sm font-semibold">Backups</h2>
        {system.backups.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">
            Nenhum backup registrado. Configure o backup diário e registre o teste de restore.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-ink-muted">
                <tr>
                  <th className="py-2">Tipo</th>
                  <th className="py-2">Início</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Restore testado</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {system.backups.map((backup) => (
                  <tr key={backup.id} className="border-t border-black/5">
                    <td className="py-2">{backup.kind}</td>
                    <td className="py-2 text-xs">{dateLabel(backup.startedAt)}</td>
                    <td className="py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          STATUS_STYLE[backup.status] ?? "bg-neutral-100 text-neutral-600"
                        }`}
                      >
                        {backup.status}
                      </span>
                    </td>
                    <td className="py-2 text-xs">{dateLabel(backup.restoreTestedAt)}</td>
                    <td className="py-2 text-right">
                      {canAct && backup.status === "SUCCESS" ? (
                        <form action={markRestoreTestedAction}>
                          <input type="hidden" name="backupId" value={backup.id} />
                          <button type="submit" className="text-xs text-brand-700 hover:underline">
                            Registrar restore testado
                          </button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-black/10 bg-white p-5">
          <h2 className="text-sm font-semibold">Webhooks pendentes ou com erro</h2>
          {system.webhookFailures.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">Nenhum evento pendente.</p>
          ) : (
            <ul className="mt-3 divide-y divide-black/5 text-xs">
              {system.webhookFailures.map((event) => (
                <li key={event.id} className="py-2">
                  <p className="font-medium">
                    {event.eventType} · {event.status}
                  </p>
                  <p className="text-ink-muted">
                    {dateLabel(event.receivedAt)} · tentativas: {event.attempts}
                  </p>
                  {event.lastError ? <p className="text-red-700">{event.lastError}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-black/10 bg-white p-5">
          <h2 className="text-sm font-semibold">Segurança recente</h2>
          {system.security.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">Nenhum evento registrado.</p>
          ) : (
            <ul className="mt-3 divide-y divide-black/5 text-xs">
              {system.security.map((event) => (
                <li key={event.id} className="py-2">
                  <p className="font-medium">
                    {event.type} · {event.severity}
                  </p>
                  <p className="text-ink-muted">{dateLabel(event.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-black/10 bg-white p-5">
        <h2 className="text-sm font-semibold">Incidentes</h2>
        {system.incidents.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">Nenhum incidente registrado.</p>
        ) : (
          <ul className="mt-3 divide-y divide-black/5 text-sm">
            {system.incidents.map((incident) => (
              <li key={incident.id} className="py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{incident.title}</p>
                  <span className="text-xs text-ink-muted">
                    {incident.severity} · {incident.status}
                  </span>
                </div>
                <p className="text-xs text-ink-muted">
                  {dateLabel(incident.startedAt)} — {incident.summary ?? "sem resumo"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
