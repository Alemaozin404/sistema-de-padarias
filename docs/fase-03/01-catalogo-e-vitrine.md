# Fase 03 — Catálogo e Vitrine

> Entrega: catálogo interno com categorias, produtos, histórico de preço e publicação
> seletiva; vitrine pública em `/[slug]` que expõe apenas o que foi publicado.

## 1. O que está funcional

| Recurso | Estado |
|---|---|
| Categorias (criar, desativar) | pronto |
| Produtos (criar, editar, publicar/despublicar, arquivar) | pronto |
| Histórico de preço append-only, com autor | pronto |
| Busca por nome e filtro por categoria | pronto |
| Limite de produtos do plano aplicado na escrita | pronto |
| Escrita bloqueada quando a assinatura restringe operação | pronto |
| Vitrine pública por slug, com cache de requisição | pronto |
| Botão WhatsApp e cópia do link da vitrine | pronto |
| Upload de imagem | **não implementado** (campos existem; falta R2) |
| Carrinho / pedido online | fora do escopo desta fase |

## 2. Decisões

1. **Custo e estoque nunca chegam à vitrine.** A projeção pública é uma função pura
   (`toPublicProduct`) com lista explícita de campos: campo novo em `products` fica privado por
   padrão. Existe teste que injeta `costCents`, `currentStock`, `sku` na origem e verifica que
   não saem no resultado.
2. **Vitrine lê com o mesmo `withTenant`.** Não há política permissiva para leitura pública:
   resolve-se o slug em `tenants` (tabela global) e então abre-se a transação com o tenant
   daquele slug. Um erro de filtro não vira vazamento entre estabelecimentos.
3. **Arquivar é soft delete.** `deleted_at` preserva histórico; o produto some da vitrine e do
   catálogo sem apagar registro financeiro.
4. **Vitrine dinâmica (`force-dynamic`) por enquanto.** ISR exige invalidação por tenant
   (`revalidateTag`) para não mostrar preço velho; fica para a otimização da Fase 09, junto com
   CDN. Correção antes de cache.
5. **Limite de imagens e upload ficam para quando houver R2.** A UI não anuncia upload.

## 3. API de servidor

- `src/modules/catalog/actions.ts`: `saveProductAction`, `toggleAvailabilityAction`,
  `archiveProductAction`, `saveCategoryAction`, `archiveCategoryAction`.
- `src/modules/catalog/queries.ts`: consultas internas e `getPublicTenant` / `getPublicCatalog`.
- `src/modules/catalog/rules.ts`: `parsePriceToCents`, `canPublishProduct`, `toPublicProduct`,
  `groupByCategory`.

## 4. Verificação

- `tests/unit/catalog.test.ts` — preço, publicação, projeção pública e agrupamento.
- `tests/unit/slug.test.ts` — slug com acento, colisão e limite de tamanho.
- `tests/integration/schema-local.test.ts` — migrations + RLS em PostgreSQL real (WASM),
  cobrindo FK composta de categoria/produto e append-only do histórico de preço.
