# Fase 05 — Produção

> Entrega: ficha técnica com rendimento, planejamento e conclusão de fornada, consumo
> proporcional dos insumos, entrada do produto acabado, custo real por unidade e
> registro de perdas — tudo em uma transação.

## 1. O que está funcional

| Recurso | Estado |
|---|---|
| Fichas técnicas (criar, editar, arquivar) | pronto |
| Insumos da ficha com quantidade e custo estimado | pronto |
| Planejar fornada sem movimentar estoque | pronto |
| Concluir fornada consumindo insumos e dando entrada no produto | pronto |
| Bloqueio de conclusão por estoque insuficiente, com o insumo no erro | pronto |
| Custo real por unidade e custo total do lote | pronto |
| Perdas com motivo, quantidade e custo proporcional | pronto |
| Cancelamento de fornada planejada | pronto |
| Módulo liberado pela feature `production.enabled` | pronto |
| Baixa automática por venda de produto acabado | fase futura |

## 2. Modelo

- `recipes`: produto gerado (`product_id` por FK composta com o tenant), nome,
  `yield_quantity`, unidade do rendimento, observações e `is_active`.
- `recipe_items`: insumo (`ingredient_id` por FK composta), quantidade para a ficha
  inteira e unidade copiada do insumo. Único por `(tenant, recipe, ingredient)`.
- `production_batches`: quantidade planejada, produzida, custo real por unidade,
  status (`PLANNED`, `IN_PROGRESS`, `DONE`, `CANCELLED`) e datas.
- `production_losses`: perda da fornada, append-only, com motivo e custo.

O rendimento é o total que a ficha inteira produz. A quantidade de cada insumo é
sempre a da ficha inteira; a escala acontece na conclusão.

## 3. Decisões

1. **Planejar não move estoque.** A fornada planejada é só intenção. Consumo,
   entrada do produto, perda e custo acontecem juntos na conclusão.
2. **Consumo proporcional, incluindo a perda.** O fator é
   `(produzidas + perdas) ÷ rendimento`. A perda também consumiu insumo, então entra
   no consumo; só não entra no estoque de produto acabado.
3. **Quantidade arredondada na precisão do banco.** Cada consumo é arredondado a
   3 casas antes de compor o custo, para que o movimento gravado e o custo fechem.
4. **Custo real, não custo da ficha.** O custo usa o custo atual dos insumos no
   momento da conclusão. `unit_cost_cents` do lote é o custo total dos insumos
   consumidos dividido pelas unidades boas.
5. **Custo da perda separado.** `production_losses.cost_cents` recebe a fatia do
   custo total proporcional às unidades perdidas, preservando a rastreabilidade.
6. **Tudo ou nada.** A conclusão roda em uma transação: se qualquer insumo não tem
   saldo, o erro nomeia o insumo e nenhum movimento, perda ou status é gravado.
7. **Movimentos reutilizam o livro-razão.** A produção usa o mesmo
   `applyStockMovement` do estoque, com `PRODUCTION_CONSUMPTION` (saída de insumo) e
   `PRODUCTION_OUTPUT` (entrada de produto). O saldo continua sendo consequência dos
   movimentos.
8. **Perda é prova, não rascunho.** `production_losses` é append-only, como
   `stock_movements`: o runtime só tem `SELECT`/`INSERT`.
9. **Plano e status separados.** `production.enabled` define se o módulo existe no
   plano (hoje, Empresarial); `canWriteOperational` define se dá para escrever agora.
   Nenhum dos dois bloqueia leitura.

## 4. API de servidor

- `src/modules/production/actions.ts`: `saveRecipeAction`, `addRecipeItemAction`,
  `removeRecipeItemAction`, `archiveRecipeAction`, `planBatchAction`,
  `completeBatchAction`, `cancelBatchAction`.
- `src/modules/production/queries.ts`: `listRecipes`, `getRecipe`, `listBatches`,
  `getBatch`, `listBatchLosses`.
- `src/modules/production/rules.ts`: `productionFactor`, `computeProductionCost`,
  `batchIsEditable`.
- `src/modules/inventory/ledger.ts`: `applyStockMovement` e `InsufficientStockError`,
  compartilhados entre estoque manual e produção.

## 5. Telas

- `/producao`: fichas, custo estimado por unidade, planejamento e histórico de
  fornadas.
- `/producao/receitas/[id]`: insumos da ficha, custo da ficha, edição e arquivamento.
- `/producao/lotes/[id]`: necessidade planejada com saldo atual, conclusão com perdas,
  custo real, perdas registradas e cancelamento.

## 6. Verificação

- `tests/unit/production.test.ts` — fator com e sem perda, consumo arredondado, custo
  total, custo por unidade, custo da perda e validação de entradas.
- `tests/integration/schema-local.test.ts` — RLS com `FORCE` nas quatro tabelas,
  isolamento de ficha/item/fornada/perda entre tenants, FK composta de insumo,
  movimentos de produção append-only e perdas sem `UPDATE`/`DELETE`.
- `npm run typecheck`, `npm test` e `npm run build` passam. Os testes de integração
  contra o Neon continuam pulados sem `DATABASE_URL`.

## 7. Limites conhecidos

- O status `IN_PROGRESS` existe no modelo, mas a UI trabalha com `PLANNED` → `DONE`
  (ou `CANCELLED`). Não há apontamento parcial de fornada.
- A baixa por venda do produto acabado pertence à fase de vendas.
- Não há custo médio ponderado: o saldo do produto guarda quantidade; o custo de
  referência de cada lote fica em `production_batches.unit_cost_cents`.
