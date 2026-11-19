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
    // Instalação sem banco configurado: aviso explícito, nunca página vazia fingindo sucesso.
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

  return (
    <main className="min-h-screen bg-brand-50/40">
      <header className="border-b border-black/5 bg-white">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-ink-muted">Catálogo</p>
            <h1 className="text-xl font-semibold tracking-tight">{tenant.tradeName}</h1>
          </div>
          <div className="flex items-center gap-2">
            <CopyLinkButton
              url={publicUrl}
              label="Copiar link"
              copiedLabel="Link copiado"
            />
            {tenant.whatsapp ? (
              <a
                href={whatsappLink(tenant.whatsapp, tenant.tradeName)}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                Pedir no WhatsApp
              </a>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-10">
        {products.length === 0 ? (
          <p className="rounded-xl border border-black/10 bg-white p-8 text-center text-sm text-ink-muted">
            Esta padaria ainda não publicou produtos. Volte em breve.
          </p>
        ) : (
          <div className="space-y-10">
            {groups.map((group) => (
              <section key={group.slug}>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">
                  {group.name}
                </h2>
                <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                  {group.products.map((product) => (
                    <li
                      key={product.id}
                      className="rounded-xl border border-black/10 bg-white p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-medium">{product.name}</h3>
                        <p className="shrink-0 text-sm font-semibold">
                          {formatBRL(product.priceCents)}
                          <span className="ml-1 text-xs font-normal text-ink-muted">
                            /{product.unit.toLowerCase()}
                          </span>
                        </p>
                      </div>
                      {product.description ? (
                        <p className="mt-1 text-sm text-ink-muted">{product.description}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        <footer className="mt-14 border-t border-black/5 pt-6 text-xs text-ink-muted">
          <p>
            Preços e disponibilidade podem mudar sem aviso. Pedidos são combinados diretamente
            com o estabelecimento.
          </p>
          <p className="mt-2">
            <Link href="/" className="hover:text-brand-700">
              Gestão para padarias
            </Link>
          </p>
        </footer>
      </div>
    </main>
  );
}
