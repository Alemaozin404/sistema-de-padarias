import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthError, requireTenant } from "@/lib/auth";
import { loadEntitlements, getTenantBasic } from "@/modules/billing/queries";
import {
  archiveCategoryAction,
  archiveProductAction,
  toggleAvailabilityAction,
} from "@/modules/catalog/actions";
import { countProducts, listCategories, listProducts } from "@/modules/catalog/queries";
import { formatBRL } from "@/modules/shared/money";
import { limitOf } from "@/modules/plans/entitlements";
import { CategoryForm } from "@/components/catalog/category-form";
import { ProductForm } from "@/components/catalog/product-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Catálogo" };

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; categoria?: string }>;
}) {
  const params = await searchParams;

  let membership;
  try {
    membership = await requireTenant();
  } catch (error) {
    if (error instanceof AuthError) redirect("/login");
    throw error;
  }

  const [tenant, loaded, categories, total] = await Promise.all([
    getTenantBasic(membership.tenantId),
    loadEntitlements(membership.tenantId),
    listCategories(membership.tenantId),
    countProducts(membership.tenantId),
  ]);

  const products = await listProducts(membership.tenantId, {
    search: params.q,
    categoryId: params.categoria,
  });

  const canWrite = loaded?.entitlements.access.canWriteOperational ?? false;
  const limit = loaded ? limitOf(loaded.entitlements, "products.max") : null;
  const activeCategories = categories.filter((category) => category.isActive);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">Catálogo</p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink">Produtos</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {total} {total === 1 ? "produto cadastrado" : "produtos cadastrados"}
            {limit !== null ? ` de ${limit} disponíveis no plano` : " · sem limite no seu plano"}
          </p>
        </div>

        {tenant ? (
          <Link
            href={`/${tenant.slug}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-border px-3 py-2 text-sm hover:border-brand-600"
          >
            Ver vitrine pública ↗
          </Link>
        ) : null}
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
        <h2 className="text-sm font-semibold">Categorias</h2>
        <p className="mt-1 text-xs text-ink-muted">
          Categorias organizam a vitrine. Desativar uma categoria não remove os produtos.
        </p>

        {activeCategories.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {activeCategories.map((category) => (
              <li
                key={category.id}
                className="flex items-center gap-2 rounded-full border border-border px-3 py-1 text-sm"
              >
                {category.name}
                {canWrite ? (
                  <form action={archiveCategoryAction}>
                    <input type="hidden" name="categoryId" value={category.id} />
                    <button
                      type="submit"
                      className="text-xs text-ink-muted hover:text-red-700"
                      title="Desativar categoria"
                    >
                      remover
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-ink-muted">Nenhuma categoria ativa.</p>
        )}

        {canWrite ? (
          <div className="mt-4">
            <CategoryForm />
          </div>
        ) : null}
      </section>

      {canWrite ? (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold">Cadastrar produto</h2>
          <p className="mt-1 text-xs text-ink-muted">
            O produto entra no catálogo interno. Marque “mostrar na vitrine” para publicá-lo.
          </p>
          <div className="mt-4 max-w-2xl">
            <ProductForm categories={activeCategories} submitLabel="Cadastrar produto" />
          </div>
        </section>
      ) : (
        <p className="rounded-xl border border-border bg-surface p-4 text-sm text-ink-muted">
          Você pode consultar o catálogo, mas o cadastro está suspenso por pendência financeira.
          Seus dados continuam disponíveis para consulta e exportação.
        </p>
      )}

      <section className="space-y-4">
        <form className="flex flex-wrap gap-2" action="/catalogo">
          <input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Buscar por nome"
            className="rounded-lg border border-border px-3 py-2 text-sm"
          />
          <select
            name="categoria"
            defaultValue={params.categoria ?? ""}
            className="rounded-lg border border-border px-3 py-2 text-sm"
          >
            <option value="">Todas as categorias</option>
            {activeCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg border border-border px-3 py-2 text-sm hover:border-brand-600"
          >
            Filtrar
          </button>
        </form>

        {products.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface p-6 text-sm text-ink-muted">
            Nenhum produto encontrado. {canWrite ? "Cadastre o primeiro acima." : ""}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-surface-sunken text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Produto</th>
                  <th className="px-4 py-3 font-medium">Categoria</th>
                  <th className="px-4 py-3 font-medium">Preço</th>
                  <th className="px-4 py-3 font-medium">Vitrine</th>
                  <th className="px-4 py-3 font-medium sr-only">Ações</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <Link
                        href={`/catalogo/${product.id}`}
                        className="font-medium hover:text-brand-700"
                      >
                        {product.name}
                      </Link>
                      <p className="text-xs text-ink-muted">{product.slug}</p>
                    </td>
                    <td className="px-4 py-3 text-ink-muted">
                      {product.categoryName ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {formatBRL(product.priceCents)}
                      <span className="text-xs text-ink-muted"> /{product.unit.toLowerCase()}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          product.isAvailable
                            ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700"
                            : "rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600"
                        }
                      >
                        {product.isAvailable ? "Publicado" : "Interno"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-3">
                        {canWrite ? (
                          <>
                            <form action={toggleAvailabilityAction}>
                              <input type="hidden" name="productId" value={product.id} />
                              <button
                                type="submit"
                                className="text-xs text-brand-700 hover:underline"
                              >
                                {product.isAvailable ? "Despublicar" : "Publicar"}
                              </button>
                            </form>
                            <form action={archiveProductAction}>
                              <input type="hidden" name="productId" value={product.id} />
                              <button
                                type="submit"
                                className="text-xs text-ink-muted hover:text-red-700"
                              >
                                Arquivar
                              </button>
                            </form>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

