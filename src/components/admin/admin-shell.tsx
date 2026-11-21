"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { platformLogoutAction } from "@/modules/platform/auth-actions";
import { adminGlobalSearch, type AdminSearchResult } from "@/modules/platform/search-actions";
import { PlatformReauthForm } from "@/components/platform/reauth-form";

type NavItem = { href: string; label: string };
type NavGroup = { title: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  {
    title: "Visão geral",
    items: [
      { href: "/admin", label: "Dashboard" },
      { href: "/admin/atividades", label: "Atividade recente" },
    ],
  },
  {
    title: "Clientes e padarias",
    items: [
      { href: "/admin/clientes", label: "Padarias" },
      { href: "/admin/usuarios", label: "Usuários" },
    ],
  },
  {
    title: "Assinaturas e planos",
    items: [
      { href: "/admin/assinaturas", label: "Assinaturas" },
      { href: "/admin/upgrades", label: "Upgrades" },
      { href: "/admin/planos", label: "Planos" },
      { href: "/admin/inadimplencia", label: "Inadimplência" },
    ],
  },
  {
    title: "Financeiro",
    items: [
      { href: "/admin/financeiro", label: "Financeiro" },
      { href: "/admin/cupons", label: "Cupons" },
      { href: "/admin/promocoes", label: "Promoções" },
    ],
  },
  {
    title: "Segurança",
    items: [
      { href: "/admin/seguranca", label: "Segurança" },
      { href: "/admin/auditoria", label: "Auditoria" },
    ],
  },
  {
    title: "Sistema",
    items: [
      { href: "/admin/monitoramento", label: "Monitoramento" },
      { href: "/admin/suporte", label: "Suporte" },
      { href: "/admin/configuracoes", label: "Configurações" },
      { href: "/admin/sistema", label: "Sistema" },
    ],
  },
];

export function AdminShell({
  children,
  email,
  role,
  fresh,
}: {
  children: React.ReactNode;
  email: string;
  role: string;
  fresh: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<AdminSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("admin-theme");
    const isDark = stored === "dark" || (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === "Escape") setSearchOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    const t = setTimeout(async () => {
      if (searchQuery.trim().length < 2) {
        setSearchResults([]);
        return;
      }
      setSearchLoading(true);
      try {
        const r = await adminGlobalSearch(searchQuery);
        setSearchResults(r);
      } finally {
        setSearchLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [searchQuery, searchOpen]);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("admin-theme", next ? "dark" : "light");
  }

  function isActive(href: string) {
    if (href === "/admin") return pathname === "/admin";
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-ink">
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 transform border-r border-border bg-white transition-transform duration-200 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <Link href="/admin" className="font-display text-base font-semibold tracking-tight text-brand-700">
            MASTER CONTROL
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-ink-muted lg:hidden"
            aria-label="Fechar menu"
          >
            ✕
          </button>
        </div>
        <nav className="h-[calc(100vh-3.5rem)] overflow-y-auto px-3 py-4">
          {GROUPS.map((group) => {
            const isCollapsed = collapsed[group.title];
            return (
              <div key={group.title} className="mb-4">
                <button
                  type="button"
                  onClick={() => setCollapsed((prev) => ({ ...prev, [group.title]: !prev[group.title] }))}
                  className="mb-1 flex w-full items-center justify-between px-2 text-[10px] font-semibold uppercase tracking-wider text-ink-muted"
                >
                  <span>{group.title}</span>
                  <span className="text-xs">{isCollapsed ? "+" : "−"}</span>
                </button>
                {!isCollapsed && (
                  <ul className="space-y-0.5">
                    {group.items.map((item) => (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => setOpen(false)}
                          className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                            isActive(item.href)
                              ? "bg-brand-50 text-brand-700"
                              : "text-ink-soft hover:bg-surface-soft hover:text-ink"
                          }`}
                        >
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* Main */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-border bg-white/80 backdrop-blur-xl">
          <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="text-ink-muted lg:hidden"
              aria-label="Abrir menu"
            >
              ☰
            </button>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="hidden items-center gap-2 rounded-lg border border-border bg-surface-soft px-3 py-1.5 text-xs text-ink-muted sm:flex"
            >
              <span>Pesquisar…</span>
              <kbd className="rounded border border-border bg-white px-1.5 py-0.5 text-[10px]">Ctrl K</kbd>
            </button>
            <div className="hidden text-xs text-ink-muted sm:block">
              {role === "OWNER" ? "Proprietário" : "Suporte"}
            </div>
            <div className="flex items-center gap-3">
              <PlatformReauthForm fresh={fresh} />
              <button
                type="button"
                onClick={toggleTheme}
                className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-ink-soft hover:bg-surface-soft"
                aria-label="Alternar tema"
              >
                {dark ? "☀ Claro" : "☾ Escuro"}
              </button>
              <span className="hidden text-xs text-ink-muted sm:inline">{email}</span>
              <form action={platformLogoutAction}>
                <button type="submit" className="text-xs text-ink-muted hover:text-brand-700">
                  Sair
                </button>
              </form>
            </div>
          </div>
        </header>
        <main className="px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>

      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-20" onClick={() => setSearchOpen(false)}>
          <div className="w-full max-w-xl rounded-xl border border-border bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Pesquisar padarias, usuários, assinaturas, pagamentos, reembolsos…"
              className="w-full rounded-t-xl border-b border-border px-4 py-3 text-sm outline-none"
            />
            <div className="max-h-96 overflow-y-auto p-2">
              {searchLoading && <p className="px-3 py-2 text-xs text-ink-muted">Buscando…</p>}
              {!searchLoading && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
                <p className="px-3 py-2 text-xs text-ink-muted">Nenhum resultado.</p>
              )}
              {searchResults.map((r) => (
                <Link
                  key={`${r.type}-${r.id}`}
                  href={r.href}
                  onClick={() => setSearchOpen(false)}
                  className="block rounded-lg px-3 py-2 hover:bg-surface-soft"
                >
                  <p className="text-sm font-medium text-ink">{r.title}</p>
                  <p className="text-xs text-ink-muted">{r.subtitle}</p>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
