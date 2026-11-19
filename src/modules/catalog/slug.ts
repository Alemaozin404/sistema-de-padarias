/**
 * Slug de produto/categoria: identifica o item na URL pública.
 * Puro e determinístico para poder ser testado sem banco.
 */

export const SLUG_MAX_LENGTH = 60;

export function slugify(input: string): string {
  const base = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, "");

  return base || "item";
}

/**
 * Garante unicidade dentro do estabelecimento acrescentando sufixo numérico.
 * O índice único do banco continua sendo a última palavra: isto é conveniência,
 * não a garantia.
 */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const root = slugify(base);
  if (!used.has(root)) return root;

  for (let suffix = 2; suffix <= 999; suffix += 1) {
    const candidate = `${root.slice(0, SLUG_MAX_LENGTH - String(suffix).length - 1)}-${suffix}`;
    if (!used.has(candidate)) return candidate;
  }

  throw new Error("Não foi possível gerar um endereço único para o item.");
}
