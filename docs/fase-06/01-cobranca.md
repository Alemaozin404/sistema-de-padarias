# Fase 06 — Assinaturas e cobrança

> Entrega: fatura no servidor, checkout Pix no Asaas, webhook assinado e idempotente,
> conciliação ativa, renovação diária por cron e registro manual de pagamento pelo admin.

## 1. O que está funcional

| Recurso | Estado |
|---|---|
| Fatura inicial discriminando mensalidade + ativação | pronto |
| Renovação mensal (mensalidade, sem ativação) | pronto |
| Checkout criando cliente e cobrança Pix no Asaas | pronto |
| `pix_payload`, expiração e link da fatura persistidos | pronto |
| Webhook com token em tempo constante | pronto |
| Idempotência por `(gateway, event_id)` e por `(gateway, gateway_payment_id)` | pronto |
| Ativação somente após webhook, conciliação ou registro manual | pronto |
| Conciliação sob demanda e no cron | pronto |
| Cron diário de renovação, vencimento e conciliação | pronto |
| Registro manual de pagamento (admin) | pronto, com tela no painel da Fase 08 |
| Checkout com cartão/boleto e parcelamento | fora desta fase |

## 2. Fluxo

1. A assinatura nasce `PENDING` no cadastro, com preço e ativação em snapshot.
2. `/assinatura` cria a fatura `DRAFT` com `total = mensalidade + ativação - desconto`.
3. O servidor garante o cliente no Asaas (por CPF/CNPJ) e cria uma cobrança `PIX`
   com `externalReference = tenantId:invoiceId`.
4. A fatura vira `OPEN`, guarda `gateway_invoice_id`, `pix_payload`, `pix_expires_at`
   e `invoice_url`.
5. O pagamento chega por webhook (`PAYMENT_RECEIVED`/`PAYMENT_CONFIRMED`), por
   conciliação ou por registro manual do admin.
6. A fatura vira `PAID`, o pagamento é gravado uma única vez, o período pago é
   calculado e a assinatura vira `ACTIVE` com `next_due_date`.

Abandonar o checkout deixa a fatura aberta e a assinatura `PENDING`: nada é ativado
sem confirmação.

## 3. Decisões

1. **A fatura é a fonte de verdade do valor.** Preço e ativação vêm do snapshot da
   assinatura; o formulário não envia valor. O webhook só aplica pagamento cujo
   valor em centavos confere com `total_cents`.
2. **Idempotência em duas camadas.** O evento é único por `(gateway, event_id)` e o
   pagamento por `(gateway, gateway_payment_id)`. O webhook grava o evento antes de
   processar; reenvio processado responde 200 sem efeito. Evento `FAILED` pode ser
   reivindicado e reprocessado na próxima entrega.
3. **Uma fatura aberta por assinatura.** Índice parcial único em
   `invoices (subscription_id) WHERE status IN ('OPEN','OVERDUE')` impede dois
   checkouts simultâneos. Clicar duas vezes reaproveita a mesma fatura.
4. **Cobrança idempotente no gateway.** Antes de criar uma cobrança, o servidor
   procura uma existente por `externalReference`; assim um erro de rede entre o
   POST e a gravação do id não gera segunda cobrança.
5. **Referência externa carrega o tenant.** O webhook não tem sessão: ele resolve
   `tenantId:invoiceId`, abre o contexto RLS daquele tenant e confere se a cobrança
   realmente pertence à fatura. Referência desconhecida ou de outro tenant não muda
   estado.
6. **Pagamento confirmado não regride.** Fatura já paga é no-op. Renovação paga antes
   do fim do período estende o período em vez de encurtá-lo; pagamento em atraso
   recomeça a contagem no dia do pagamento.
7. **Toda transição financeira é auditada.** `invoice.created`, `invoice.charge_created`,
   `invoice.paid`, `invoice.renewal_created` e o histórico de status da assinatura
   registram ator e motivo. O webhook usa ator `GATEWAY`; o cron, `SYSTEM`.
8. **Sem chave, sem cobrança.** `isGatewayConfigured()` é checado antes de qualquer
   chamada. Sem `ASAAS_API_KEY`/`ASAAS_WEBHOOK_TOKEN`, a tela avisa e nenhum registro
   financeiro falso é criado.
9. **Webhook sem detalhe na resposta.** Token inválido retorna 401 e é registrado em
   `security_events` como `SIGNATURE_INVALID`; erro de negócio retorna 500 para o
   gateway reenviar, mas o detalhe fica apenas em `webhook_events.last_error`.
10. **Cron autenticado.** `/api/cron/billing` exige `Authorization: Bearer $CRON_SECRET`
    comparado em tempo constante; sem segredo, responde 503. O agendamento está em
    `vercel.json` (diário, 06:00 UTC).

## 4. API de servidor

- `src/modules/billing/gateway.ts`: cliente HTTP Asaas —
  `createCustomer`, `findCustomerByDocument`, `createPixPayment`,
  `findPaymentByExternalReference`, `getPayment`, `getPixQrCode`.
- `src/modules/billing/service.ts`: `listInvoices`, `getInvoice`, `startCheckout`,
  `ensureChargeForInvoice`, `applyConfirmedPayment`, `reconcileInvoice`,
  `generateRenewalInvoices`, `markOverdueInvoices`, `reconcileOpenInvoices`,
  `registerManualPayment`.
- `src/modules/billing/rules.ts`: total da fatura, CPF/CNPJ, período pago,
  referência externa, eventos pagos, método e comparação de token.
- `src/modules/billing/actions.ts`: `startCheckoutAction`, `createChargeAction`,
  `reconcileInvoiceAction`, `registerManualPaymentAction`.
- `src/modules/billing/webhook.ts`: efeito do evento Asaas.
- Rotas: `POST /api/webhooks/asaas` e `GET|POST /api/cron/billing`.

## 5. Banco e isolamento

- `invoices`, `payments`, `subscriptions` e `subscription_status_history` continuam
  com RLS `ENABLE` + `FORCE`; a cobrança só enxerga o tenant do contexto.
- `webhook_events` é global e agora tem `UPDATE` para o runtime marcar
  `PROCESSED`/`FAILED`, `attempts` e `last_error`; não tem `DELETE`.
- `payments` tem `UNIQUE (gateway, gateway_payment_id)` e
  `invoices` tem o índice parcial de fatura aberta (migration `0004`).
- `security_events` recebe tentativas de webhook com token inválido.

## 6. Configuração

```env
ASAAS_API_KEY=""
ASAAS_WEBHOOK_TOKEN="token-de-32-ou-mais-caracteres"
ASAAS_BASE_URL="https://api-sandbox.asaas.com/v3"
CRON_SECRET="segredo-do-cron"
```

No painel do Asaas, configure o webhook `https://seu-dominio/api/webhooks/asaas`
com o mesmo `authToken` de `ASAAS_WEBHOOK_TOKEN` e os eventos
`PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`, `PAYMENT_OVERDUE` e `PAYMENT_REFUNDED`.

## 7. Verificação

- `tests/unit/billing.test.ts` — total da fatura, CPF/CNPJ, soma de meses,
  referência externa, eventos pagos, conversão de reais para centavos e token.
- `tests/integration/schema-local.test.ts` — índice de fatura aberta, unicidade do
  pagamento do gateway, deduplicação de evento e atualização de status do webhook
  em PostgreSQL real (PGlite).
- `npm run typecheck`, `npm test` e `npm run build` passam.
- O fluxo real no sandbox Asaas (Pix, webhook e conciliação) depende de credenciais
  e ainda não foi executado neste ambiente. Os 6 testes de integração Neon também
  continuam pulados sem `DATABASE_URL`.

## 8. Limites conhecidos

- Checkout apenas Pix; cartão e boleto exigem captura e UX adicionais.
- O registro manual é feito no detalhe do cliente do painel global da Fase 08,
  com reautenticação do administrador.
- A régua de cobrança, multa, juros e `RESTRICTED`/`SUSPENDED` estão na Fase 07;
  esta fase já marca `PAST_DUE` ao vencer e reativa com período estendido ao pagar.
- Não há parcelamento, cupom aplicado automaticamente nem nota fiscal.
