# Fase 07 — Régua de cobrança e travamento

> Entrega: encargos por atraso, régua D-3 → D+15 executada no cron diário com uma
> notificação por evento, transições auditadas e bloqueio gradual de escrita e do
> painel operacional — sem nunca bloquear leitura, exportação ou pagamento.

## 1. O que está funcional

| Recurso | Estado |
|---|---|
| `billing_settings`: multa, juros, prazos e régua em JSON | pronto (seed) |
| Encargos: multa única + juros pro rata die sobre a mensalidade | pronto |
| Cron diário: renovação → vencimento → conciliação → régua | pronto |
| Lembretes D-3, D0, D+1, D+5, D+10 e D+15 | pronto |
| `notification_log` com `dedupe_key` única por fatura/passo/canal | pronto |
| Transições `PAST_DUE` → `RESTRICTED` → `SUSPENDED` com histórico | pronto |
| `RESTRICTED` bloqueia escrita operacional | pronto |
| `SUSPENDED` bloqueia o painel operacional, mantendo dados e pagamento | pronto |
| Banner persistente de status no painel | pronto |
| Reativação após pagamento confirmado, com período estendido | pronto (Fase 06) |
| Envio por WhatsApp/SMS | fora desta fase |
| Encerramento automático em `CANCEL_CANDIDATE` | não: decisão humana na Fase 08 |

## 2. Régua e estados

A régua padrão fica em `billing_settings.dunning_schedule` e pode ser trocada sem
deploy. Cada passo tem `dayOffset`, `channel` (`EMAIL`) e `template`:

| Offset | Template | Efeito |
|---|---|---|
| −3 | `due_soon` | lembrete antes do vencimento |
| 0 | `payment_pending` | aviso no dia do vencimento |
| +1 | `overdue` | fatura vira `OVERDUE` e assinatura `PAST_DUE` |
| +5 | `restriction_warning` | aviso; com enforcement, escrita é restringida |
| +10 | `suspension_warning` | aviso; com enforcement, painel é suspenso |
| +15 | `termination_warning` | fim da régua; assinatura fica `SUSPENDED` |

`statusForDelay` calcula o alvo a partir dos prazos `restrictAfterDays`,
`suspendAfterDays` e `cancelAfterDays`. `nextStatus` só avança severidade: a régua
nunca regride uma assinatura. `CANCEL_CANDIDATE` é o sinal de encerramento, mas
`databaseStatus` o mantém em `SUSPENDED` — cancelar é decisão do proprietário.

Com os prazos padrão (5/10/15), a simulação de 20 dias percorre:

```
ACTIVE → PAST_DUE → RESTRICTED → SUSPENDED → CANCEL_CANDIDATE (persistido como SUSPENDED)
```

## 3. Encargos

`computeLateCharges` aplica:

- multa única de `finePercent` (2% por padrão) sobre `planAmountCents`;
- juros de `interestPercentMonth` (1% ao mês) proporcionais aos dias de atraso,
  usando mês comercial de 30 dias e arredondamento para cima;
- `total = mensalidade + ativação + multa + juros − desconto`.

O cálculo é recalculado a cada execução, não acumulado, e só ocorre quando
`enforceRestrictions = true` e a fatura **não** tem `gatewayInvoiceId`. Alterar o
valor de um Pix já emitido faria o webhook recusar um pagamento legítimo; nesse
caso o encargo entra na próxima cobrança. A tela `/assinatura` discrimina multa e
juros quando existirem.

## 4. Notificações e idempotência

O cron grava uma linha em `notification_log` por passo devido, com
`dedupe_key = invoice:{id}:d{offset}:{channel}`. A chave é única, então rodar o job
várias vezes no mesmo dia, ou em dias seguintes, não repete o evento. O envio é
feito depois da transação, com o status atualizado para `SENT`, `FAILED` ou
`SKIPPED`.

Sem `RESEND_API_KEY` (ou sem e-mail no estabelecimento), a notificação fica
`SKIPPED` com o motivo — nada é marcado como enviado sem ter sido. Canais que não
sejam `EMAIL` também ficam `SKIPPED` até serem automatizados.

## 5. Travamento

Toda decisão passa por `accessForStatus` em `src/modules/plans/entitlements.ts`:

| Status | Leitura operacional | Escrita | Exportação | Pagamento |
|---|---|---|---|---|
| `ACTIVE` / `PAST_DUE` | sim | sim | sim | sim |
| `RESTRICTED` | sim | não | sim | sim |
| `SUSPENDED` | não (painel operacional) | não | sim | sim |
| `CANCELLED` | não | não | sim | não |

As server actions operacionais consultam `canWriteOperational`; em `RESTRICTED`
retornam erro de pendência financeira em vez de gravar. As páginas continuam
acessíveis para consulta e o layout exibe um banner com link para `/assinatura`.
Exportação e área financeira nunca são bloqueadas — há teste percorrendo todos os
status.

Quando o pagamento é confirmado (webhook, conciliação ou registro manual), a Fase 06
aplica o período pago, limpa `restricted_at`/`suspended_at` e devolve a assinatura
para `ACTIVE`, registrando a transição no histórico.

## 6. Cron e configuração

`GET|POST /api/cron/billing`, autenticado por `CRON_SECRET`, executa nesta ordem:

1. `generateRenewalInvoices` — emite renovação até 3 dias antes do vencimento;
2. `markOverdueInvoices` — marca atraso e `PAST_DUE`;
3. `reconcileOpenInvoices` — quem pagou não recebe aviso;
4. `runDunning` — encargos, notificações e transições.

A resposta inclui contadores de `renewals`, `overdue`, `reconciliation` e `dunning`
(`notifications`, `sent`, `skipped`, `failed`, `transitions`, `charges`).

```sql
-- Ativar os efeitos de travamento (padrão do seed: modo aviso)
update billing_settings
set enforce_restrictions = true
where id = 1;
```

Prazos e percentuais também vivem no banco:

```sql
update billing_settings
set fine_percent = 2,
    interest_percent_month = 1,
    restrict_after_days = 5,
    suspend_after_days = 10,
    cancel_after_days = 15
where id = 1;
```

O seed é idempotente e não sobrescreve valores editados.

## 7. API de servidor

- `src/modules/dunning/schedule.ts`: `parseDunningSchedule`, `statusForDelay`,
  `nextStatus`, `databaseStatus`, `notificationsDue`, `relativeDays`.
- `src/modules/dunning/templates.ts`: `renderDunningMessage` com escape de HTML.
- `src/modules/dunning/service.ts`: `loadDunningSettings`, `runDunning`,
  processamento por tenant, encargos, notificações e transições.
- `src/modules/billing/service.ts`: `listActiveTenantIds`, renovação com horizonte
  de 3 dias.
- `src/app/api/cron/billing/route.ts`: pipeline diário completo.
- `src/app/(app)/layout.tsx`: banner de status com link para a assinatura.
- `src/app/(app)/assinatura/page.tsx`: linhas de multa e juros.

## 8. Verificação

- `tests/unit/dunning.test.ts` — simulação de 20 dias, uma notificação por passo
  mesmo com reexecução, encargos, parsing defensivo da régua, templates com escape
  e exportação liberada em todos os status.
- `tests/integration/schema-local.test.ts` — unicidade de `dedupe_key` e registro
  da transição em PostgreSQL real (PGlite).
- `npm run typecheck`, `npm test` (124 passando, 6 pulados) e `npm run build`.

## 9. Limites conhecidos

- O enforcement nasce desligado (`enforce_restrictions = false`): por padrão a
  régua apenas notifica e marca `PAST_DUE`. Ligue a flag depois de validar prazos,
  textos e o parecer jurídico sobre multa/juros/suspensão.
- Envio apenas por e-mail via Resend. WhatsApp e SMS ficam `SKIPPED`.
- Uma notificação `SKIPPED` por falta de configuração de e-mail não é reenviada
  automaticamente quando a chave é configurada; o evento continua registrado.
- Faturas com Pix já emitido não recebem encargo retroativo no mesmo título.
- O encerramento após D+15 não é automático; a assinatura para em `SUSPENDED` até
  a decisão do proprietário (Fase 08).
- Sem credenciais Asaas/Resend, nenhum envio real foi exercitado neste ambiente; os
  6 testes de integração Neon seguem pulados sem `DATABASE_URL`.
