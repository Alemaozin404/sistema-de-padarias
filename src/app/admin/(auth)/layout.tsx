import Link from "next/link";

export default function PlatformAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <Link href="/" className="text-sm text-ink-muted hover:text-brand-700">
        ← Voltar ao site
      </Link>
      <p className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">
        Plataforma
      </p>
      {children}
    </div>
  );
}
