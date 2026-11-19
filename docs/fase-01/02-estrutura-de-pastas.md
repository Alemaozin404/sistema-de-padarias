# Fase 01 — Estrutura de Pastas e Fronteiras de Módulo

## 1. Árvore proposta

```
projeto/
├─ docs/
│  ├─ fase-01/                 # esta fase: arquitetura, dados, custos, fases
│  ├─ modulos/                 # um documento por módulo, criado na fase correspondente
│  └─ operacao/                # runbooks: backup, restore, incidente, LGPD
├─ public/                     # apenas estáticos públicos (favicon, og-image padrão)
├─ scripts/                    # utilitários de operação (backup, seed, verificação)
├─ src/
│  ├─ app/
│  │  ├─ (marketing)/
│  │  │  ├─ page.tsx           # página comercial
│  │  │  ├─ planos/page.tsx
│  │  │  └─ contato/page.tsx
│  │  ├─ (auth)/
│  │  │  ├─ login/page.tsx
│  │  │  ├─ cadastro/page.tsx
│  │  │  ├─ recuperar-senha/page.tsx
│  │  │  └─ redefinir-senha/page.tsx
│  │  ├─ (app)/                # área autenticada do estabelecimento
│  │  │  ├─ layout.tsx         # shell: sidebar, seletor de tenant, banner de status
│  │  │  ├─ dashboard/page.tsx
│  │  │  ├─ produtos/
│  │  │  ├─ categorias/
│  │  │  ├─ estoque/
│  │  │  ├─ producao/
│  │  │  ├─ relatorios/
│  │  │  ├─ equipe/
│  │  │  ├─ assinatura/        # faturas, pagamento, regularização, cancelamento
│  │  │  └─ configuracoes/     # identidade visual, dados da loja, conta
│  │  ├─ (admin)/admin/        # painel global do proprietário
│  │  │  ├─ layout.tsx         # shell separado + reautenticação
│  │  │  ├─ financeiro/
│  │  │  ├─ clientes/
│  │  │  ├─ planos/
│  │  │  ├─ comercial/
│  │  │  └─ sistema/
│  │  ├─ (public)/[slug]/      # vitrine pública por estabelecimento
│  │  │  ├─ page.tsx
│  │  │  └─ produto/[productSlug]/page.tsx
│  │  └─ api/
│  │     ├─ auth/[...all]/route.ts
│  │     ├─ webhooks/asaas/route.ts
│  │     ├─ cron/[job]/route.ts        # protegido por CRON_SECRET
│  │     └─ uploads/presign/route.ts
│  ├─ modules/
│  │  ├─ auth/          # cadastro, sessão, convites, reset, 2FA, autorização
│  │  ├─ tenants/       # estabelecimentos, identidade visual, configurações
│  │  ├─ catalog/       # categorias, produtos, imagens, preço/histórico
│  │  ├─ inventory/     # insumos, movimentos, saldos, perdas, alertas
│  │  ├─ production/    # fichas técnicas, fornadas, custo, consumo
│  │  ├─ plans/         # planos, features, entitlements, limites
│  │  ├─ billing/       # assinaturas, faturas, pagamentos, gateway, webhooks
│  │  ├─ dunning/       # régua de cobrança, estados, restrição/reativação
│  │  ├─ notifications/ # templates e envio (e-mail; WhatsApp via link)
│  │  ├─ reports/       # consultas agregadas de dashboard e relatórios
│  │  ├─ admin/         # operações do painel global (financeiro, clientes, sistema)
│  │  ├─ audit/         # trilha de auditoria
│  │  └─ shared/        # erros, resultados, dinheiro, datas, paginação, permissões
│  ├─ db/
│  │  ├─ schema/        # um arquivo por agregado (tenants.ts, billing.ts, ...)
│  │  ├─ migrations/
│  │  ├─ policies/      # SQL de RLS versionado
│  │  └─ seed/          # dados de desenvolvimento (NUNCA em produção)
│  ├─ components/
│  │  ├─ ui/            # shadcn/ui
│  │  ├─ app/           # sidebar, page-header, empty-state, data-table
│  │  └─ marketing/     # seções da página comercial
│  ├─ lib/
│  │  ├─ env.ts         # validação de variáveis com Zod (falha no boot)
│  │  ├─ db.ts          # pool + helper withTenant
│  │  ├─ auth.ts        # sessão, guards requireUser/requireTenant/requireAdmin
│  │  ├─ gateway/       # interface PaymentGateway + adaptador Asaas
│  │  ├─ storage.ts     # R2 presign
│  │  ├─ mailer.ts
│  │  ├─ cache.ts
│  │  ├─ logger.ts
│  │  └─ rate-limit.ts
│  ├─ styles/globals.css
│  └─ middleware.ts     # apenas redirecionamento grosseiro; autorização real no servidor
├─ tests/
│  ├─ unit/
│  ├─ integration/      # banco real de teste + RLS
│  └─ e2e/              # fluxos críticos
├─ .env.example
├─ drizzle.config.ts
├─ next.config.ts
├─ package.json
├─ tsconfig.json
└─ README.md
```

## 2. Contrato de um módulo

Cada módulo em `src/modules/<nome>/` segue o mesmo desenho:

```
modules/catalog/
├─ schema.ts        # validação Zod de entrada/saída
├─ service.ts       # regras de negócio; recebe TenantContext; é a única porta de entrada
├─ repository.ts    # SQL/Drizzle; sempre filtrado por tenant_id
├─ queries.ts       # leituras para listagens e relatórios (paginação obrigatória)
└─ index.ts         # API pública do módulo (o que outros módulos podem importar)
```

Regras de fronteira:

1. Página/rota chama **service** ou **queries**. Nunca importa `repository` direto.
2. Módulo não importa `repository` de outro módulo; usa o `index.ts` do outro.
3. Nenhum módulo acessa `process.env`; tudo passa por `lib/env.ts`.
4. Toda escrita recebe `TenantContext` e valida permissão + entitlement antes de tocar o banco.
5. Toda resposta de erro usa o mesmo formato (`{ code, message, fields? }`), sem vazar stack.

## 3. Convenções

- **Nomes de domínio em português na UI**, código e banco em inglês (evita mistura de plural).
- **Rotas em português** (`/produtos`, `/estoque`), IDs em UUID v7.
- **Dinheiro em centavos inteiros** (`price_cents`), nunca `float`. Formatação só na borda.
- **Datas em UTC no banco**, convertidas para `America/Sao_Paulo` na apresentação.
- **Soft delete** (`deleted_at`) apenas onde histórico importa (produtos, clientes); movimentos
  de estoque e pagamentos são imutáveis.
- **Paginação por cursor** em listas grandes; `LIMIT` obrigatório em toda query de listagem.
- **Server Actions** para mutações do próprio painel; Route Handlers para webhooks, cron e upload.
- **Feature flag de módulo** via entitlements, não `if` espalhado por componente.

## 4. Variáveis de ambiente previstas

| Variável | Uso | Pública? |
|---|---|---|
| `DATABASE_URL` | conexão pooled (runtime) | não |
| `DATABASE_URL_UNPOOLED` | migrations | não |
| `BETTER_AUTH_SECRET` | assinatura de sessão | não |
| `BETTER_AUTH_URL` | URL canônica da aplicação | não |
| `ASAAS_API_KEY` | gateway | não |
| `ASAAS_WEBHOOK_TOKEN` | validação do webhook | não |
| `ASAAS_BASE_URL` | sandbox/produção | não |
| `RESEND_API_KEY` | e-mail | não |
| `EMAIL_FROM` | remetente verificado | não |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | imagens | não |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | rate limit | não |
| `CRON_SECRET` | proteger jobs | não |
| `SENTRY_DSN` | monitoramento | não |
| `NEXT_PUBLIC_APP_URL` | links absolutos | sim |
| `NEXT_PUBLIC_WHATSAPP_SUPPORT` | contato comercial | sim |

`.env.example` lista todas sem valores reais; `.env*` fica no `.gitignore`.
