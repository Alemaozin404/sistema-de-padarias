import { togglePlatformFlagAction } from "@/modules/platform/settings-actions";
import { getPlatformSettings } from "@/modules/platform/queries";
import { DEFAULT_PLATFORM_FLAGS } from "@/db/schema";
import { getPlatformSession } from "@/lib/platform-auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configurações" };

export default async function PlatformSettingsPage({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const session = await getPlatformSession();
  if (!session) redirect("/admin/login");
  const params = await searchParams;
  const settings = await getPlatformSettings();
  const settingsMap = new Map(settings.map((setting) => [setting.key, setting]));
  const canAct = session.role === "OWNER";

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">MASTER CONTROL</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink">Configurações</h1>
        <p className="mt-1 text-sm text-ink-muted">Flags operacionais da plataforma.</p>
      </div>

      {params.erro ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{params.erro}</p> : null}
      {params.ok ? <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{params.ok}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {Object.entries(DEFAULT_PLATFORM_FLAGS).map(([key, defaultValue]) => {
          const current = settingsMap.get(key)?.value as { enabled?: boolean } | null;
          const enabled = current?.enabled ?? defaultValue;
          return (
            <form key={key} action={togglePlatformFlagAction} className="rounded-xl border border-border bg-white p-5">
              <input type="hidden" name="key" value={key} />
              <input type="hidden" name="value" value={String(!enabled)} />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{key}</p>
                  <p className="text-xs text-ink-muted">Valor atual: {enabled ? "ativado" : "desativado"}</p>
                </div>
                {canAct ? (
                  <button type="submit" className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700">
                    {enabled ? "Desativar" : "Ativar"}
                  </button>
                ) : null}
              </div>
            </form>
          );
        })}
      </div>
    </div>
  );
}
