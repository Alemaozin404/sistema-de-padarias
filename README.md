# Plataforma de gestão para padarias

SaaS multi-tenant para padarias e panificadoras: vitrine digital, produtos, estoque,
produção e gestão da assinatura.

Documentação de decisão: [`docs/fase-01/`](docs/fase-01/). O código implementa a
**Fase 02 (fundação segura)**, a **Fase 03 (catálogo e vitrine)**, a **Fase 04
(estoque)**, a **Fase 05 (produção)**, a **Fase 06 (assinaturas e cobrança)**,a **Fase 07 (régua de cobrança e travamento)**, a **Fase 08 (painel global)** e a
**Fase 09 (endurecimento)** — ver
[`docs/fase-02/01-fundacao.md`](docs/fase-02/01-fundacao.md),
[`docs/fase-03/01-catalogo-e-vitrine.md`](docs/fase-03/01-catalogo-e-vitrine.md),
[`docs/fase-04/01-estoque.md`](docs/fase-04/01-estoque.md),
[`docs/fase-05/01-producao.md`](docs/fase-05/01-producao.md),
[`docs/fase-06/01-cobranca.md`](docs/fase-06/01-cobranca.md),
[`docs/fase-07/01-regua-e-travamento.md`](docs/fase-07/01-regua-e-travamento.md) e
[`docs/fase-08/01-painel-global.md`](docs/fase-08/01-painel-global.md) e
[`docs/fase-09/01-endurecimento.md`](docs/fase-09/01-endurecimento.md).

Rotas principais: `/cadastro`, `/login`, `/dashboard`, `/catalogo`, `/estoque`,
`/producao`, `/equipe`, `/assinatura` (painel), `/admin` (realm separado do
proprietário, com 2FA) e `/[slug]` (vitrine pública de cada estabelecimento).

## Requisitos

- Node.js 20+
- PostgreSQL 15+ (Neon em produção)

## Configuração

```bash
npm install
cp .env.example .env.local     # preencha DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL

npm run db:migrate             # aplica o schema (conexão não pooled)
npm run db:policies            # aplica RLS, triggers e grants
npm run db:seed                # planos, features e configuração de cobrança
npm run admin:create -- dono@seudominio.com "senha-com-12-caracteres" "Seu Nome" OWNER
npm run dev                    # http://localhost:3000
```

O administrador da plataforma é provisionado por script, nunca por auto-cadastro.
No primeiro acesso a `/admin`, cadastre a chave TOTP no aplicativo autenticador.

`BETTER_AUTH_SECRET` pode ser gerado com `openssl rand -base64 32`.

Para cobrar em sandbox, preencha `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN` (32+ caracteres,
o mesmo configurado no Asaas), `ASAAS_BASE_URL=https://api-sandbox.asaas.com/v3` e
`CRON_SECRET`. O webhook é `POST /api/webhooks/asaas`; o job diário é
`/api/cron/billing` (agendado no `vercel.json`), que também executa a régua de
cobrança. O health check horário é `/api/cron/health`. Para enviar os avisos por
e-mail, configure `RESEND_API_KEY` e `EMAIL_FROM`.

## Scripts

| Script | Função |
|---|---|
| `npm run dev` / `build` / `start` | ciclo do Next.js |
| `npm run typecheck` | TypeScript strict, sem emitir |
| `npm test` | unitários + RLS em PostgreSQL real (PGlite); integração Neon quando há `DATABASE_URL` |
| `npm run e2e` | suíte Playwright (Chromium) dos fluxos críticos e cabeçalhos de segurança |
| `npm run e2e:install` | instala o Chromium do Playwright |
| `npm run db:generate` | gera nova migration a partir do schema |
| `npm run db:migrate` | aplica migrations |
| `npm run db:policies` | reaplica políticas RLS (idempotente) |
| `npm run db:seed` | dados de referência (idempotente, não sobrescreve edições) |
| `npm run admin:create -- ...` | provisiona/redefine a senha de um administrador da plataforma |

## Regras que o código não viola

- **Nenhum estado financeiro nasce no navegador.** Assinatura só fica `ACTIVE` após
  confirmação do gateway (Fase 06) — hoje o cadastro cria assinatura `PENDING`.
- **Isolamento no banco, não na disciplina.** RLS com `FORCE`, além de FK obrigatória e
  helper `withTenant` que define o contexto na transação.
- **Dado do cliente nunca é refém.** Nenhum status de assinatura bloqueia leitura ou
  exportação; isso está coberto por teste.
- **Saldo de estoque é derivado.** Movimento é append-only e o saldo é atualizado na
  mesma transação; corrigir é lançar um ajuste com motivo.
- **Fornada é uma transação só.** Concluir consome insumos, dá entrada no produto
  acabado, registra perdas e grava o custo real; estoque insuficiente desfaz tudo.
- **Pagamento não nasce do navegador.** A fatura é criada no servidor com o preço
  contratado e só vira `PAID` com webhook validado, conciliação no gateway ou registro
  manual do admin; reenvio do webhook é idempotente por evento e por pagamento.
- **Preços, limites e prazos vivem no banco**, não no código.
- **Sem recurso anunciado antes de existir**: a UI só mostra o que está implementado.

## Estrutura

```
src/app          rotas (marketing, auth, painel, admin, api)
src/components   UI
src/db/schema    tabelas por agregado (auth, tenancy, plans, billing, system)
src/db/policies  RLS em SQL versionado
src/modules      regras de negócio por módulo (catalog, members, billing, plans, dunning, ...)
src/lib          env, db/withTenant, auth, id
scripts          migrations de política, seed de referência
tests            unit (puro) e integration (PostgreSQL real)
```

## Produção

Antes de cobrar um cliente real: CNPJ ativo, conta aprovada no gateway, parecer jurídico
sobre multa/juros/suspensão e backup testado. Enquanto isso, `billing_settings.enforce_restrictions`
permanece `false` (modo aviso).
