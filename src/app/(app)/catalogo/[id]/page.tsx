import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AuthError, requireTenant } from "@/lib/auth";
import { loadEntitlements } from "@/modules/billing/queries";
import {
  archiveProductAction,
  toggleAvailabilityAction,
} from "@/modules/catalog/actions";
import {
  getProduct,
  listCategories,
  listPriceHistory,
} from "@/modules/catalog/queries";
import { formatBRL } from "@/modules/shared/money";
import { ProductForm } from "@/components/catalog/product-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `Editar produto ${id.slice(0, 8)}` };
}

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let membership;
  try {
    membership = await requireTenant();
  } catch (error) {
    if (error instanceof AuthError) redirect("/login");
    throw error;
  }

  const [product, loaded, categories] = await Promise.all([
    getProduct(membership.tenantId, id),
    loadEntitlements(membership.tenantId),
    listCategories(membership.tenantId),
  ]);

  if (!product || product.deletedAt) notFound();

  const history = await listPriceHistory(membership.tenantId, product.id);
  const canWrite = loaded?.entitlements.access.canWriteOperational ?? false;
  const activeCategories = categories.filter((category) => category.isActive);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <Link href="/catalogo" className="text-sm text-ink-muted hover:text-brand-700">
          ← Catálogo
        </Link>
        <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-ink">{product.name}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Criado em {product.createdAt.toLocaleDateString("pt-BR")} · endereço {product.slug}
        </p>
      </div>

      {loaded?.entitlements.warning ? (
        <div
          role="status"
          className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
        >
          {loaded.entitlements.warning}
        </div>
      ) : null}

      <section className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Dados do produto</h2>
          <div className="flex items-center gap-3 text-xs">
            <span
              className={
                product.isAvailable
                  ? "rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700"
                  : "rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-600"
              }
            >
              {product.isAvailable ? "Publicado na vitrine" : "Somente catálogo interno"}
            </span>
            {canWrite ? (
              <form action={toggleAvailabilityAction}>
                <input type="hidden" name="productId" value={product.id} />
                <button type="submit" className="text-brand-700 hover:underline">
                  {product.isAvailable ? "Despublicar" : "Publicar"}
                </button>
              </form>
            ) : null}
          </div>
        </div>

        <div className="mt-5">
          {canWrite ? (
            <ProductForm
              categories={activeCategories}
              submitLabel="Salvar alterações"
              product={{
                id: product.id,
                name: product.name,
                description: product.description,
                priceCents: product.priceCents,
                unit: product.unit,
                categoryId: product.categoryId,
                isAvailable: product.isAvailable,
              }}
            />
          ) : (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink-muted">Preço</dt>
                <dd>{formatBRL(product.priceCents)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink-muted">Unidade</dt>
                <dd>{product.unit}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase tracking-wide text-ink-muted">Descrição</dt>
                <dd>{product.description ?? "—"}</dd>
              </div>
            </dl>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold">Histórico de preço</h2>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">
            Nenhuma alteração de preço registrada desde o cadastro.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-black/5 text-sm">
            {history.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between py-2">
                <span>
                  {formatBRL(entry.oldPriceCents)} → {formatBRL(entry.newPriceCents)}
                </span>
                <span className="text-xs text-ink-muted">
                  {entry.createdAt.toLocaleString("pt-BR")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {canWrite ? (
        <section className="rounded-xl border border-red-200 bg-red-50/40 p-5">
          <h2 className="text-sm font-semibold">Arquivar produto</h2>
          <p className="mt-1 text-sm text-ink-muted">
            O produto sai do catálogo e da vitrine, mas o histórico financeiro é preservado.
            Nenhum dado é apagado.
          </p>
          <form action={archiveProductAction} className="mt-3">
            <input type="hidden" name="productId" value={product.id} />
            <button
              type="submit"
              className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-red-700 hover:bg-red-50"
            >
              Arquivar este produto
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
