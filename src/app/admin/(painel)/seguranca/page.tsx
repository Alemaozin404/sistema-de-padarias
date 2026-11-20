import { listSecurityEvents } from "@/modules/platform/queries";
import { getPlatformSession } from "@/lib/platform-auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Segurança" };

export default async function PlatformSecurityPage() {
  const session = await getPlatformSession();
  if (!session) redirect("/admin/login");
  const events = await listSecurityEvents(200);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">MASTER CONTROL</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink">Segurança</h1>
        <p className="mt-1 text-sm text-ink-muted">Eventos de segurança, acessos indevidos e alertas.</p>
      </div>

      {events.length === 0 ? (
        <p className="rounded-xl border border-border bg-white p-5 text-sm text-ink-muted">Nenhum evento de segurança registrado.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-white">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-ink-muted">
              <tr>
                <th className="px-4 py-3">Quando</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Severidade</th>
                <th className="px-4 py-3">Ator</th>
                <th className="px-4 py-3">IP</th>
                <th className="px-4 py-3">Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} className="border-b border-border last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 text-xs">{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(event.createdAt)}</td>
                  <td className="px-4 py-3 font-mono text-xs">{event.type}</td>
                  <td className="px-4 py-3">{event.severity}</td>
                  <td className="px-4 py-3 text-xs">{event.actorId ?? "—"}</td>
                  <td className="px-4 py-3 text-xs">{event.ip ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-ink-muted">{JSON.stringify(event.detail ?? {}).slice(0, 120)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
