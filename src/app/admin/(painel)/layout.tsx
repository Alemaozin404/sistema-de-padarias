import Link from "next/link";
import { redirect } from "next/navigation";
import { PlatformReauthForm } from "@/components/platform/reauth-form";
import { platformLogoutAction } from "@/modules/platform/auth-actions";
import { getPlatformSession, isMfaComplete } from "@/lib/platform-auth";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin", label: "Visão geral" },
  { href: "/admin/clientes", label: "Clientes" },
  { href: "/admin/planos", label: "Planos" },
  { href: "/admin/cupons", label: "Cupons e descontos" },
  { href: "/admin/auditoria", label: "Auditoria" },
  { href: "/admin/sistema", label: "Sistema" },
];

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const session = await getPlatformSession();
  if (!session) redirect("/admin/login");
  if (!isMfaComplete(session)) redirect("/admin/2fa");

  const fresh =
    session.lastReauthAt !== null &&
    session.lastReauthAt.getTime() > Date.now() - 10 * 60 * 1000;

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-black/10 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="flex items-center gap-5">
            <Link href="/admin" className="text-sm font-semibold tracking-tight">
              Plataforma
            </Link>
            <nav className="flex flex-wrap gap-4 text-sm">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-ink-muted hover:text-brand-700"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <PlatformReauthForm fresh={fresh} />
            <span className="text-xs text-ink-muted">{session.email}</span>
            <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
              {session.role === "OWNER" ? "Proprietário" : "Suporte"}
            </span>
            <form action={platformLogoutAction}>
              <button type="submit" className="text-ink-muted hover:text-brand-700">
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
