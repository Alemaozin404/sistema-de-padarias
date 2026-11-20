import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicCatalog, getPublicTenant } from "@/modules/catalog/queries";
import { groupByCategory } from "@/modules/catalog/rules";
import { formatBRL } from "@/modules/shared/money";
import { publicEnv } from "@/lib/env";
import { CopyLinkButton } from "@/components/catalog/copy-link-button";

export const dynamic = "force-dynamic";

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUG_REGEX.test(slug)) return { title: "Vitrine não encontrada" };
  try {
    const tenant = await getPublicTenant(slug);
    return {
      title: tenant ? `${tenant.tradeName} · Catálogo` : "Vitrine não encontrada",
      description: tenant ? `Produtos e preços de ${tenant.tradeName}.` : undefined,
    };
  } catch {
    return { title: "Vitrine indisponível" };
  }
}

function whatsappLink(whatsapp: string, tenantName: string): string {
  const digits = whatsapp.replace(/\D/g, "");
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  const text = encodeURIComponent(`Olá! Vi o catálogo de ${tenantName} e gostaria de fazer um pedido.`);
  return `https://wa.me/${withCountry}?text=${text}`;
}

export default async function PublicStorefront({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUG_REGEX.test(slug)) notFound();

  let tenant;
  let products;
  try {
    tenant = await getPublicTenant(slug);
    products = tenant ? await getPublicCatalog(tenant.id) : [];
  } catch {
    return (
      <main className="mx-auto max-w-2xl px-6 py-24">
        <h1 className="text-xl font-semibold">Vitrine indisponível</h1>
        <p className="mt-2 text-sm text-ink-muted">
          O catálogo público precisa de um banco de dados configurado nesta instalação.
        </p>
      </main>
    );
  }

  if (!tenant) notFound();

  const groups = groupByCategory(products);
  const publicUrl = `${publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/${tenant.slug}`;
  const accent = tenant.brandColor || "#2563eb";

  return (
    <main className="min-h-screen bg-surface-soft">
      <header className="sticky top-0 z-30 border-b border-border bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-2xl text-lg font-semibold text-white shadow-sm"
              style={{ backgroundColor: accent }}
            >
              {tenant.tradeName.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-ink-muted">Catálogo digital</p>
              <h1 className="font-display text-xl font-semibold tracking-tight">{tenant.tradeName}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CopyLinkButton url={publicUrl} label="Copiar link" copiedLabel="Link copiado" />
            {tenant.whatsapp ? (
              <a
                href={whatsappLink(tenant.whatsapp, tenant.tradeName)}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
              >
                Pedir no WhatsApp
              </a>
            ) : null}
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-border bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-12 md:grid-cols-[1.1fr_0.9fr] md:items-center">
          <div className="animate-fade-up">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-700">Experiência premium</p>
            <h2 className="mt-3 font-display text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
              {tenant.tradeName}
            </h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-ink-muted">
              Explore nosso catálogo, escolha seus produtos favoritos e faça seu pedido diretamente pelo WhatsApp.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href="#catalogo" className="rounded-xl bg-brand-600 px-5 py-3 text-sm font-medium text-white shadow-sm hover:bg-brand-700">
                Conhecer o catálogo
              </a>
              {tenant.whatsapp ? (
                <a
                  href={whatsappLink(tenant.whatsapp, tenant.tradeName)}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl border border-border px-5 py-3 text-sm font-medium text-ink hover:border-brand-600 hover:text-brand-700"
                >
                  Falar no WhatsApp
                </a>
              ) : null}
            </div>
          </div>
          <div className="relative hidden md:block">
            <div className="aspect-[4/3] rounded-[2rem] border border-border bg-gradient-to-br from-brand-50 to-white p-6 shadow-xl">
              <div className="flex h-full items-center justify-center rounded-[1.5rem] border border-dashed border-brand-200 bg-white/70 text-center">
                <div>
                  <p className="font-display text-2xl font-semibold text-brand-700">{products.length}</p>
                  <p className="mt-1 text-sm text-ink-muted">produtos disponíveis</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div id="catalogo" className="mx-auto max-w-6xl px-6 py-10">
        {groups.length === 0 ? (
          <div className="rounded-3xl border border-border bg-white p-10 text-center">
            <p className="font-display text-xl font-semibold">Catálogo em preparação</p>
            <p className="mt-2 text-sm text-ink-muted">Esta padaria ainda não publicou produtos. Volte em breve.</p>
          </div>
        ) : (
          <div className="space-y-12">
            <nav className="flex flex-wrap gap-2">
              {groups.map((group) => (
                <a
                  key={group.slug}
                  href={`#categoria-${group.slug}`}
                  className="rounded-full border border-border bg-white px-4 py-2 text-sm font-medium text-ink-muted transition hover:border-brand-600 hover:text-brand-700"
                >
                  {group.name}
                </a>
              ))}
            </nav>

            {groups.map((group) => (
              <section key={group.slug} id={`categoria-${group.slug}`} className="scroll-mt-28">
                <div className="mb-5 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">Categoria</p>
                    <h2 className="mt-1 font-display font-display text-2xl font-bold tracking-tight text-ink">{group.name}</h2>
                  </div>
                  <span className="text-sm text-ink-muted">{group.products.length} itens</span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {group.products.map((product) => (
                    <article
                      key={product.id}
                      className="group overflow-hidden rounded-3xl border border-border bg-white transition hover:-translate-y-1 hover:shadow-xl"
                    >
                      <div className="aspect-[4/3] bg-gradient-to-br from-brand-50 to-surface-soft">
                        <div className="flex h-full items-center justify-center text-4xl text-brand-200">●</div>
                      </div>
                      <div className="p-5">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-display text-lg font-semibold tracking-tight">{product.name}</h3>
                          <p className="shrink-0 text-base font-semibold text-brand-700">
                            {formatBRL(product.priceCents)}
                            <span className="ml-1 text-xs font-normal text-ink-muted">/{product.unit.toLowerCase()}</span>
                          </p>
                        </div>
                        {product.description ? (
                          <p className="mt-2 line-clamp-2 text-sm leading-6 text-ink-muted">{product.description}</p>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        <footer className="mt-16 border-t border-border pt-8 text-sm text-ink-muted">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-display text-lg font-semibold text-ink">{tenant.tradeName}</p>
              <p className="mt-1 text-xs">Preços e disponibilidade podem mudar sem aviso. Pedidos são combinados diretamente com o estabelecimento.</p>
            </div>
            <Link href="/" className="text-xs font-medium text-brand-700 hover:underline">
              Gestão para padarias
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
}