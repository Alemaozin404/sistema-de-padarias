# Fase 08 — Painel global do proprietário

> Entrega: realm separado em `/admin`, com cookie próprio, TOTP obrigatório,
> reautenticação para ações sensíveis, auditoria append-only, MRR, clientes,
> planos/limites, cupons/descontos e painel de sistema.

## 1. O que está funcional

| Recurso | Estado |
|---|---|
| Realm separado `/admin` (cookie e sessão próprios) | pronto |
| 2FA TOTP obrigatório, com proteção contra replay | pronto |
| Reautenticação por senha para ações sensíveis (10 min) | pronto |
| `audit_logs` consultável, com antes/depois, IP e user agent | pronto |
| MRR, faturamento do mês, ativos, inadimplentes e churn | pronto |
| Receita/MRR por plano | pronto |
| Lista e detalhe de clientes | pronto |
| Suspender/reativar cliente | pronto |
| Trocar plano do cliente (próxima fatura) | pronto |
| Registro de pagamento manual no detalhe do cliente | pronto |
| Edição de preços, ativação, destaque e limites por plano | pronto |
| Cupons cadastrados e ativáveis | pronto no cadastro; resgate no checkout ainda não |
| Desconto negociado por cliente, com vigência, aplicado em novas faturas | pronto |
| Painel de sistema: health, backups, incidents, webhooks e segurança | pronto |
| Cron horário de health check | pronto |
| Registrar teste de restore de um backup | pronto |
| Papel SUPPORT somente leitura nas ações sensíveis | pronto |
| Rate limiting do login administrativo | fora desta fase (Fase 09) |
| Envio de códigos de recuperação do 2FA | não implementado |

## 2. Autenticação separada

Nenhuma sessão da padaria abre `/admin`. O painel usa:

- cookie `padaria_platform_session`, `httpOnly`, `SameSite=Lax`, `Secure` em produção;
- token aleatório de 32 bytes; o banco guarda somente SHA-256;
- sessão de 8 horas na tabela `platform_sessions`;
- vínculo ativo em `platform_admins` (`OWNER` ou `SUPPORT`), independente de
  `memberships` da padaria;
- TOTP obrigatório (`mfa_required = true`). O segredo é cifrado com AES-256-GCM,
  usando chave derivada de `BETTER_AUTH_SECRET`;
- o passo TOTP aceito é gravado em `totp_last_step`, impedindo reutilizar o mesmo
  código dentro da janela de 30 segundos.

Fluxo: `/admin/login` valida e-mail/senha com o hash do Better Auth, cria a sessão
pendente e leva a `/admin/2fa`. No primeiro acesso, a página mostra a chave para o
aplicativo autenticador. Só depois do código correto o layout do painel abre.

Ações sensíveis exigem reautenticação por senha nos últimos 10 minutos, mesmo com a
sessão ativa. O formulário “Reautenticar” fica no topo do painel.

## 3. Bootstrap do administrador

O provisionamento não é feito pela aplicação. Rode no servidor, com acesso ao banco:

```bash
npm run db:migrate
npm run db:policies
npm run admin:create -- dono@seudominio.com "uma-senha-com-12-caracteres" "Seu Nome" OWNER
```

O script cria/atualiza `user` + `account` (provider `credential`) + `platform_admins`.
No primeiro login, cadastre o TOTP. Para um suporte somente leitura, use `SUPPORT`.
Não existe auto-cadastro de administrador.

## 4. Métricas

Definições explícitas para o número bater com o banco:

- **MRR**: soma de `subscriptions.price_cents` com status `ACTIVE`, inclusive se o
  tenant estiver suspenso administrativamente (o contrato continua ativo).
- **Clientes ativos**: assinatura `ACTIVE` **e** tenant `ACTIVE`.
- **Inadimplentes**: tenant suspenso ou assinatura `PAST_DUE`, `RESTRICTED` ou
  `SUSPENDED`.
- **Faturamento do mês**: faturas `PAID` com `paid_at` no mês corrente.
- **Vencido**: soma das faturas `OVERDUE`.
- **Churn 30 dias**: assinaturas `CANCELLED` com `cancelled_at` nos últimos 30 dias.
- **Receita por plano**: faturamento do mês atribuído ao plano atual da assinatura
  do tenant; não é uma série histórica por snapshot de plano.

O painel percorre tenant por tenant com `withTenant`, em vez de abrir uma exceção de
RLS para consultas agregadas. É mais lento, mas mantém o isolamento como regra.

## 5. Gestão de clientes

- **Suspender/reativar** altera `tenants.status`. A suspensão administrativa
  prevalece sobre a assinatura em `effectiveSubscriptionStatus`: o painel operacional
  fica bloqueado, mas leitura, exportação e pagamento continuam liberados.
- **Trocar plano** atualiza `plan_id` e o snapshot `price_cents` da assinatura aberta.
  A fatura já emitida não muda; a próxima renovação usa o novo valor.
- **Pagamento manual** usa o total da fatura no servidor, grava `payments` com id
  sintético `manual:*` e reativa a assinatura pelo fluxo normal da Fase 06.
- Toda alteração exige `OWNER` reautenticado e grava `audit_logs`.

## 6. Planos, cupons e descontos

- Planos editáveis em `/admin/planos`: nome, descrição, mensalidade, ativação,
  destaque e a matriz de features/limites. Mudanças valem para novas assinaturas;
  o cliente antigo mantém o snapshot.
- Cupons têm código único, percentual (1–100) ou valor fixo em centavos, plano
  opcional, vigência e limite de usos. Podem ser ativados/desativados. **O resgate
  automático no checkout ainda não está ligado** — o cadastro já existe e a UI avisa.
- Descontos negociados (`tenant_discounts`) têm tipo, valor, vigência e motivo
  obrigatório. O desconto vigente mais recente entra automaticamente em toda fatura
  inicial ou renovação criada depois do cadastro, limitado à mensalidade.
- Cupom e desconto são coisas diferentes: cupom é código promocional; desconto é
  condição comercial registrada para um cliente.

## 7. Auditoria e sistema

`/admin/auditoria` consulta `audit_logs` sob o contexto `app.platform_admin_id`.
A política RLS libera a trilha global apenas nesse contexto, definido no servidor
depois de sessão + TOTP + reautenticação. As ações administrativas gravam ator
`ADMIN`, tenant (quando houver), entidade, antes/depois, IP e user agent.

`/admin/sistema` mostra:

- último check de banco, gateway e e-mail;
- backups, com botão para registrar restore testado;
- webhooks `FAILED`/`RECEIVED` e últimas tentativas;
- incidentes e eventos de segurança.

`GET|POST /api/cron/health`, autenticado por `CRON_SECRET`, grava um check de DB,
gateway e e-mail. O check de DB executa `select 1`; gateway e e-mail verificam se as
credenciais estão configuradas, sem chamar as APIs externas. O `vercel.json` agenda o
health a cada hora; o cron de cobrança continua diário às 06:00 UTC.

## 8. Banco e segurança

- Migration `0005` adiciona `platform_sessions`, `totp_secret`, `totp_enabled_at` e
  `totp_last_step`.
- `platform_sessions` e `platform_admins` não têm RLS de tenant: são globais, mas o
  runtime só recebe `SELECT` em `platform_admins` e CRUD em sessões.
- `plans`/`plan_features` ganharam `INSERT, UPDATE` para o admin; `backup_runs`,
  `UPDATE`; `audit_logs` ganhou a policy `platform_admin_access`.
- O token de sessão só existe no cookie; o banco guarda o hash.
- O TOTP é cifrado; trocar `BETTER_AUTH_SECRET` invalida os segredos existentes e
  exige recadastro.
- Senhas continuam no hash do Better Auth; o realm apenas reutiliza a verificação.
- Ações de leitura para `SUPPORT` são liberadas; mutações exigem `OWNER`.

## 9. Verificação

- `tests/unit/platform.test.ts` — TOTP (vetores RFC), base32, replay, parsing de
  valores, desconto e precedência da suspensão administrativa.
- `tests/integration/schema-local.test.ts` — migration, unicidade de sessão de
  plataforma, isolamento da auditoria global e regras já existentes de RLS.
- `npm run typecheck`, `npm test` (**136 passando, 6 pulados**) e `npm run build`
  passam; as rotas `/admin`, `/admin/2fa`, `/admin/clientes`, `/admin/planos`,
  `/admin/cupons`, `/admin/auditoria`, `/admin/sistema` e `/api/cron/health` foram
  geradas no build.
- Sem `DATABASE_URL`, os 6 testes Neon seguem pulados. O login real e o TOTP só
  podem ser exercitados com banco e um admin provisionado.

## 10. Limites conhecidos

- Não há rate limit específico do login administrativo; entra no endurecimento da
  Fase 09.
- Não há códigos de recuperação nem fluxo de reset do TOTP; perder a chave exige
  intervenção no banco/script.
- O resgate de cupom no checkout ainda não foi implementado; somente o cadastro.
- Não há job de backup nem integração R2 nesta fase; o painel registra o que a
  infraestrutura reportar e permite marcar o restore testado.
- “Uptime” é histórico de health checks, não um SLA calculado nem p95.
- A receita por plano usa o plano atual, não o snapshot histórico de cada fatura.
- As consultas de métricas percorrem tenants individualmente; com milhares de
  clientes será necessário um role de leitura global com BYPASSRLS e agregação SQL.
