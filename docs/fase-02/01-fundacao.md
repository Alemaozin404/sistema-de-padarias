# Fase 02 — Fundação Segura

> Escopo desta entrega e as decisões tomadas ao transformar a arquitetura da Fase 01 em
> código executável. Critério de saída da Fase 02: `docs/fase-01/05-roadmap.md`.

## 1. O que foi entregue

| Item | Estado |
|---|---|
| Next.js 16 (App Router) + React 19 + TypeScript `strict` | pronto |
| Tailwind CSS v4 com tokens de marca | pronto |
| `lib/env.ts` validando ambiente com Zod, falhando com mensagem clara | pronto |
| Schema Drizzle do núcleo (24 tabelas) | pronto |
| Migration inicial versionada | pronto |
| RLS com `ENABLE` + `FORCE`, trigger de imutabilidade de `tenant_id` | pronto |
| `withTenant` com `set_config('app.tenant_id', ..., true)` em transação | pronto |
| Cadastro (usuário + estabelecimento + vínculo + assinatura `PENDING`) | pronto |
| Login, logout, guardas `requireTenant` / `requirePlatformAdmin` | pronto |
| `getEntitlements` com features, limites e política de acesso por status | pronto |
| Página comercial e comparativo de planos lendo preços do banco | pronto |
| Painel base com situação da assinatura e recursos contratados | pronto |
| Cálculo de multa/juros, régua de cobrança e UUID v7 | pronto, com testes |
| Testes de isolamento entre tenants | pronto (executa com `DATABASE_URL`) |
| Redefinição de senha (link por e-mail) | pronto — exige `RESEND_API_KEY` + `EMAIL_FROM` |
| Convites de equipe com token de uso único | pronto |
| Seletor de estabelecimento | pronto |
| Testes de RLS em PostgreSQL real (PGlite) | pronto, 10 casos |

## 2. Decisões tomadas na implementação

1. **Tabelas de autenticação no formato do Better Auth** (`user`, `session`, `account`,
   `verification`) em vez de `users`/`sessions` do documento. O nome da tabela é contrato da
   biblioteca; renomear quebraria sessões e reset. Campos de negócio ficam em tabelas próprias
   (`memberships`, `platform_admins`). O documento de modelo de dados foi escrito antes de a
   biblioteca ser escolhida — a intenção (sessão revogável, sem token em claro) foi preservada.
2. **UUID v7 gerado na aplicação** (`lib/id.ts`), com `$defaultFn`. O banco não converte para v4;
   inserções feitas por scripts devem informar `id` ou usar `gen_random_uuid()` explicitamente.
3. **`FORCE ROW LEVEL SECURITY` também bloqueia o owner.** Consequência deliberada: a aplicação
   conecta como owner no Neon e ainda assim não escapa da política. Jobs globais precisam de role
   com `BYPASSRLS` ou iteração por tenant.
4. **`memberships` tem política própria**: permite ao usuário ler os próprios vínculos
   (`app.user_id`) antes de existir tenant ativo. Escrita continua exigindo `app.tenant_id`.
5. **`audit_logs` é restrito ao tenant**, inclusive na inserção. Auditoria global (ações do
   proprietário) será gravada pela conexão administrativa na Fase 08 — não por uma política
   permissiva que vazaria log de plataforma para cliente.
6. **Modo aviso por padrão:** `billing_settings.enforce_restrictions = false`. Nada é multado ou
   suspenso até haver parecer jurídico, conforme a Fase 01.
7. **Páginas que dependem de banco são `force-dynamic`** e tratam a ausência de configuração com
   mensagem explícita, nunca com dado fictício.

## 3. Desvios conscientes e pendências

Pendências para fechar a Fase 02 por completo:

- 2FA TOTP para o proprietário da plataforma.
- Envio automático do convite e do link de redefinição depende de provedor de e-mail
  (`RESEND_API_KEY`); sem ele a UI informa a limitação e mostra o link do convite uma vez.
- Rate limit de login (Upstash), previsto para a Fase 09.
- Transferência de propriedade do estabelecimento (hoje o OWNER não é removível).

### Convites: o que o banco garante

- O token tem 32 bytes aleatórios; o banco guarda apenas SHA-256.
- A política de `invitations` libera leitura só do convite pendente cujo `token_hash` bate com
  `app.invite_token_hash` (definido na transação a partir do link). Aceitar (UPDATE) continua
  exigindo contexto de tenant — testado.
- Assento do plano (`users.max`) conta membros ativos **e** convites pendentes.

## 4. Como validar

```bash
npm run typecheck
npm test                 # unitários + RLS em PGlite; integração Neon pulada sem DATABASE_URL
npm run build

# com banco configurado:
npm run db:migrate && npm run db:policies && npm run db:seed && npm test
```

Sem `DATABASE_URL`, a suíte de integração é **pulada com aviso** — não é relatada como aprovada.
