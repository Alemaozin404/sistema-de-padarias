# Fase 04 — Estoque

> Entrega: insumos com saldo derivado de um livro-razão imutável, entrada, saída,
> ajuste com motivo, registro de perdas, alerta de estoque baixo e histórico paginado.

## 1. O que está funcional

| Recurso | Estado |
|---|---|
| Insumos (criar, editar, arquivar) | pronto |
| Entrada, saída, ajuste e perda | pronto |
| Saldo atualizado na mesma transação do movimento | pronto |
| Alerta de estoque baixo e insumo zerado | pronto |
| Histórico paginado (global e por insumo) | pronto |
| Bloqueio de saída acima do saldo | pronto, inclusive sob concorrência |
| Escrita bloqueada quando a assinatura restringe operação | pronto |
| Módulo liberado pela feature `stock.basic` | pronto |
| Baixa automática por venda / produção | fases 05+ |

## 2. Decisões

1. **Saldo é consequência, nunca campo digitado.** O saldo vive em `stock_balances`
   e é atualizado na mesma transação que grava `stock_movements`. Não existe ação de
   "editar saldo": corrigir é lançar um ajuste com motivo.
2. **Quantidade sempre positiva; o tipo dá o sinal.** `IN` soma, `OUT` e `LOSS`
   subtraem e `ADJUSTMENT` usa `adjustment_direction` (`INCREASE`/`DECREASE`). O
   modelo original não definia o sinal do ajuste; a coluna foi adicionada por
   migration para que a soma dos movimentos continue fechando com o saldo.
3. **Concorrência resolvida no banco.** O saldo é alterado com
   `INSERT ... ON CONFLICT DO UPDATE ... WHERE saldo + delta >= 0 RETURNING`. Duas
   saídas simultâneas não podem gerar saldo negativo: a segunda não encontra linha
   para atualizar e recebe erro de negócio. Um `CHECK (quantity >= 0)` é a última
   barreira se a aplicação errar.
4. **Movimento é imutável.** `stock_movements` é append-only: o role de runtime tem
   apenas `SELECT`/`INSERT`. `created_by`, custo unitário e motivo ficam no registro;
   `LOSS` e `ADJUSTMENT` exigem motivo por `CHECK`.
5. **Plano e status separados.** A feature `stock.basic` define se o módulo existe
   para o plano; o status financeiro define se pode escrever agora. Nenhum dos dois
   bloqueia leitura ou exportação.
6. **Arquivar insumo não apaga histórico.** `is_active = false` impede novos
   movimentos e preserva saldo, movimentos e auditoria.

## 3. API de servidor

- `src/modules/inventory/actions.ts`: `saveIngredientAction`, `archiveIngredientAction`,
  `recordMovementAction`.
- `src/modules/inventory/queries.ts`: `listIngredients`, `getIngredient`,
  `listMovements`, `getBalance`.
- `src/modules/inventory/rules.ts`: `parseQuantity`, `movementDelta`,
  `requiresReason`, `stockStatus`, `isLowStock`, `formatQuantity`.

## 4. Verificação

- `tests/unit/inventory.test.ts` — quantidade, sinal por tipo, motivo obrigatório,
  alerta e arredondamento na precisão do banco.
- `tests/integration/schema-local.test.ts` — migrations e RLS em PostgreSQL real
  (PGlite), cobrindo `FORCE ROW LEVEL SECURITY` nas três tabelas, isolamento de
  insumo/saldo entre tenants, recusa de saldo negativo e imutabilidade do movimento.
