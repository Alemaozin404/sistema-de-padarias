# Fase 01 — Arquitetura da Plataforma

> Documento de decisão arquitetural. Nenhuma linha de código de aplicação deve ser escrita
> antes da aprovação desta fase. Última revisão: 17/11/2026.

## 1. Princípios que guiam as escolhas

1. **Monólito modular, não microsserviços.** Um único deploy, módulos com fronteiras explícitas.
   Microsserviços multiplicariam custo de infraestrutura, complexidade operacional e superfície
   de erro para uma operação inicial de uma pessoa.
2. **O servidor é a única fonte de verdade.** Preço, permissão, limite de plano e status de
   pagamento são sempre decididos no backend. O frontend apenas apresenta.
3. **Isolamento por construção, não por disciplina.** `tenant_id` obrigatório, RLS no PostgreSQL
   e chaves estrangeiras compostas impedem vazamento mesmo com um `WHERE` esquecido.
4. **Dado do cliente é inviolável.** Nenhum estado de cobrança bloqueia leitura ou exportação
   dos dados do próprio estabelecimento.
5. **Configuração em banco, não em código.** Preços, taxas de atraso, prazos de cobrança e
   limites de plano são editáveis pelo painel global.
6. **Custo proporcional ao tamanho.** Começar barato e escalar por uso, sem servidor dedicado
   nem cluster Kubernetes no dia um.

## 2. Stack recomendada

| Camada | Escolha | Por quê | Alternativas descartadas |
|---|---|---|---|
| Frontend + Backend | **Next.js (App Router) + React + TypeScript strict** | Um só código e um só deploy para páginas públicas, painel e API. Server Components reduzem JS no cliente. Ecossistema maduro e bem coberto por assistentes de código. | Remix (menor ecossistema), SPA + API separada (2 deploys, 2 autenticações, mais custo) |
| UI | **Tailwind CSS + shadcn/ui (Radix)** | Componentes acessíveis, sem dependência de fornecedor de design system, fáceis de adaptar à identidade de cada padaria. | MUI (visual pesado e difícil de tematizar por tenant), Bootstrap (aparência datada) |
| Banco | **PostgreSQL gerenciado (Neon)** | Relacional é o encaixe correto para estoque, produção e financeiro (transações ACID, integridade referencial). Neon oferece branching, scale-to-zero e RLS nativo. | Firebase/Firestore (sem transações multi-documento confiáveis para estoque), MongoDB (integridade de saldo fica na aplicação), MySQL (RLS inexistente) |
| ORM / migrations | **Drizzle ORM + drizzle-kit** | SQL explícito e tipado, ótimo para queries de relatório e para escrever políticas RLS. Runtime leve. | Prisma (excelente DX, porém mais pesado e menos direto para SQL bruto/RLS) |
| Autenticação | **Better Auth (sessões em banco)** | E-mail/senha, verificação, reset, 2FA TOTP e sessões revogáveis sem serviço externo pago. Sessão em cookie `httpOnly` permite revogação imediata. | Auth0/Clerk (custo por usuário cresce com a base e dados fora do país), NextAuth puro (pouco opinativo em 2FA e gestão de sessão) |
| Hash de senha | **Argon2id** (fallback scrypt) | Padrão atual para senhas; nunca texto puro, nunca MD5/SHA. | bcrypt (aceitável, mas Argon2id é superior) |
| Pagamentos | **Asaas** | Gateway brasileiro com **PIX Automático**, assinaturas em PIX/boleto/cartão, webhooks documentados com entrega *at-least-once* e `id` de evento para idempotência. | **Stripe**: PIX Automático **não está disponível para contas brasileiras** (só para empresas fora do Brasil) — inviável como gateway principal. Pagar.me/Mercado Pago: viáveis, porém a documentação pública de recorrência via PIX é menos direta |
| E-mail transacional | **Resend** | API simples, bom deliverability, plano gratuito inicial. | SMTP próprio (entregabilidade e IP reputation viram problema) |
| Imagens | **Cloudflare R2 + URLs assinadas** | Storage S3-compatible sem custo de egress, upload direto do navegador sem passar pelo servidor. | S3 (egress caro), disco local (não escala, quebra em serverless) |
| Hospedagem | **Vercel (Pro)** | Deploy integrado ao Next.js, TLS automático, previews por branch, cron. Plano Hobby é **não comercial**, portanto Pro é obrigatório para produção. | VPS própria (mais barata, mas exige patch, backup, TLS e monitoramento manuais) |
| Cache / rate limit | **Upstash Redis** | Serverless, free tier útil; usado para throttling de login e deduplicação. | Redis autogerenciado (custo operacional) |
| Monitoramento | **Sentry + Vercel Analytics/Logs + uptime externo** | Erros com stack trace e alerta por e-mail; uptime verificado de fora da Vercel. | Só logs (descoberta reativa de falhas) |
| Backups | **PITR do Neon + `pg_dump` diário para R2** | Duas camadas: restore pontual e cópia externa ao provedor. | Apenas backup do provedor (risco de conta/fornecedor) |
| DNS / WAF | **Cloudflare** | DNS, TLS, proteção de borda e cache de imagens no mesmo lugar. | DNS do registrador (sem WAF) |

### 2.1 Por que não monorepo agora

Um único app Next.js com módulos internos bem delimitados resolve o problema sem `pnpm workspaces`,
Turborepo ou pacotes publicados. A separação acontece por **fronteira de módulo** (um módulo não
importa o repositório de outro; conversa pela camada de serviço). Se o produto ganhar um app
mobile ou um worker separado, a migração para monorepo é mecânica — não precisa ser antecipada.

## 3. Visão de componentes

```
                        ┌──────────────────────────────┐
  Visitante ───────────▶│  Vitrine pública /[slug]     │  somente leitura, campos publicados
                        └──────────────┬───────────────┘
                                       │
  Cliente ─────────────▶┌──────────────▼───────────────┐
                        │  App Next.js (Vercel)        │
                        │  ├─ Painel do estabelecimento│
                        │  ├─ Área de assinatura       │
                        │  ├─ Painel global (owner)    │
                        │  ├─ API interna (Route H.)   │
                        │  └─ Webhooks / Cron          │
                        └───┬──────────┬──────────┬────┘
                            │          │          │
                 ┌──────────▼──┐  ┌────▼─────┐  ┌─▼──────────────┐
                 │ PostgreSQL  │  │ R2       │  │ Asaas          │
                 │ (Neon) RLS  │  │ imagens  │  │ PIX/cartão     │
                 └─────────────┘  └──────────┘  └─┬──────────────┘
                            │                     │ webhook assinado
                 ┌──────────▼──┐            ┌─────▼──────────────┐
                 │ Redis       │            │ Fila de eventos    │
                 │ rate limit  │            │ (tabela no Postgres)│
                 └─────────────┘            └────────────────────┘
                            │
                 ┌──────────▼──────────────┐
                 │ Resend (e-mail)         │
                 │ Cron diário (dunning)   │
                 └─────────────────────────┘
```

Duas decisões importantes de fluxo:

- **Webhook grava, job processa.** O endpoint do Asaas apenas valida o token, registra o evento
  bruto em `webhook_events` (chave única `gateway + event_id`) e responde `200`. O processamento
  roda em seguida, de forma idempotente. Reenvios do gateway não duplicam pagamento.
- **Nenhum estado financeiro nasce no navegador.** A tela de checkout só redireciona/exibe QR.
  `PAID` só existe depois de webhook validado ou de conciliação ativa contra a API do gateway.

## 4. Multi-tenant

**Modelo:** banco único, schema único, coluna `tenant_id` em toda tabela de negócio.

Três camadas de defesa, todas obrigatórias:

1. **Sessão → tenant.** O `tenant_id` vem da sessão assinada no servidor e da assinatura ativa
   do usuário; nunca de query string, body ou header enviado pelo cliente.
2. **Camada de dados.** Todo repositório recebe um contexto `{ tenantId }` obrigatório. O acesso
   é feito por um helper `withTenant(tenantId, fn)` que abre transação e executa
   `SET LOCAL app.tenant_id = '<uuid>'`.
3. **PostgreSQL RLS.** Todas as tabelas de negócio têm
   `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`, com política
   `USING (tenant_id = current_setting('app.tenant_id')::uuid)`.
   A aplicação conecta com um role sem `BYPASSRLS`; migrations usam outro role.

Complementos que fecham brechas comuns:

- **FK composta:** `UNIQUE (tenant_id, id)` em tabelas pai e FK `(tenant_id, parent_id)` nas filhas.
  Isso impede associar um produto do tenant A a uma categoria do tenant B no nível do banco.
- **`tenant_id` imutável:** trigger bloqueia `UPDATE` de `tenant_id`.
- **Vitrine pública:** não usa o role da aplicação. Usa uma *view* que expõe apenas produtos
  publicados/ativos e campos públicos da loja, sem custo, estoque ou funcionários.
- **Teste de isolamento automatizado:** para cada recurso, um teste tenta ler/alterar com o
  tenant errado e espera 404/403. Roda no CI (Fase 08).

**Identidade do estabelecimento:** `slug` único (ex.: `/padaria-central`), logo, cor primária,
WhatsApp e horários. A identidade visual é configuração de dados, não código por cliente.

## 5. Autenticação e autorização

### Estabelecimento

- Cadastro cria `user` + `tenant` + `membership(role=owner)` + assinatura em estado inicial.
- Papéis: `owner`, `manager`, `staff`. Permissões por papel na camada de serviço, com checagem
  também nas rotas (nunca só na UI).
- Sessão em cookie `httpOnly`, `Secure`, `SameSite=Lax`, expiração absoluta + renovação.
- Reset de senha com token de uso único, hash do token no banco, validade curta.
- 2FA TOTP opcional para o dono; obrigatório para administradores da plataforma.
- Throttling de login e de reset por IP + e-mail (Redis).

### Painel global (proprietário)

- **Realm separado:** tabela `platform_admins`, sessão própria, cookie próprio, 2FA obrigatório.
- Nenhum usuário de padaria tem permissão de plataforma, mesmo que seja `owner`.
- Ações sensíveis (mudar preço, suspender cliente, conceder desconto) exigem reautenticação
  recente e ficam em `audit_logs`.

## 6. Planos e permissões

Um único resolvedor de permissões no servidor:

```
getEntitlements(tenantId) -> {
  features: { "stock.basic": true, "reports.advanced": false, ... },
  limits:   { "products.max": 30, "users.max": 2, ... },
  plan:     { code, priceCents, ... },
  status:   "ACTIVE" | "PAST_DUE" | "RESTRICTED" | "SUSPENDED" | "CANCELLED"
}
```

- `feature_definitions` descreve cada chave (tipo booleano/limite) para o admin editar sem deploy.
- `plan_features` liga plano → chave + valor. Alterar preço ou limite é operação de banco.
- Limites são **verificados no servidor antes da escrita** (ex.: criar 31º produto no Essencial
  retorna erro de negócio). Contagem sempre filtrada por `tenant_id`.
- Estado da assinatura modula o acesso; o plano define o teto.
- `RESTRICTED` bloqueia **escrita** de módulos operacionais, mas mantém leitura, exportação e
  pagamento. `SUSPENDED` bloqueia o painel operacional, preservando os itens acima.
- Valores iniciais (configuráveis): Essencial 30 produtos/2 usuários; Profissional 150/5 com
  estoque básico; Empresarial sem teto prático (ex.: 2.000/20) com produção e relatórios avançados.

## 7. Cobrança

### Primeiro pagamento

O primeiro pagamento é **uma única cobrança** composta por mensalidade + ativação, com
discriminação visível na fatura e no checkout:

| Plano | Mensalidade | Ativação | Total inicial |
|---|---:|---:|---:|
| Essencial | R$ 39,90 | R$ 39,90 | R$ 79,80 |
| Profissional | R$ 59,90 | R$ 39,90 | R$ 99,80 |
| Empresarial | R$ 79,90 | R$ 39,90 | R$ 119,80 |

Renovações cobram apenas a mensalidade. Ativação é `config` no banco, com possibilidade de
isenção/promoção por cliente.

### Ciclo

1. Checkout no servidor cria cliente + cobrança no Asaas e devolve QR/link.
2. Webhook de pagamento confirmado → `payments` + `invoices` atualizados → assinatura `ACTIVE` →
   período vigente estendido.
3. Cron diário: gera renovação, aplica encargos, dispara régua de cobrança, reconcilia cobranças
   em aberto com o gateway (segunda fonte de verdade).
4. Cancelamento: mantém acesso até o fim do período pago, depois `CANCELLED` com dados preservados.

### Encargos e régua (configuráveis em `billing_settings`)

- Multa única 2%, juros simples 1% ao mês proporcionais ao atraso (cálculo em centavos, arredondado
  para cima na última casa).
- Régua proposta: D-3 lembrete, D0 cobrança, D+1 pendência, D+5 aviso de restrição,
  D+10 possível suspensão, D+15 comunicação de encerramento.
- **Bloqueio de produção:** a política financeira precisa de validação jurídica antes de cobrar
  encargos ou suspender clientes reais. Até lá, o sistema opera com prazos em modo "aviso".

## 8. Segurança

- Segredos apenas em variáveis de ambiente do servidor (`ASAAS_API_KEY`, `DATABASE_URL`,
  `BETTER_AUTH_SECRET`, chaves R2, `RESEND_API_KEY`, `CRON_SECRET`). Nunca em `NEXT_PUBLIC_*`.
- Validação de entrada com Zod em toda rota/ação; nunca confiar em tipos do cliente.
- Webhook do Asaas validado por token secreto em header + comparação em tempo constante;
  eventos fora do formato esperado são rejeitados e registrados.
- CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, proteção de CSRF para Server Actions.
- Upload de imagem: tipo/tamanho validados, nome gerado, EXIF removido, bucket privado com URL
  assinada de curta duração.
- Auditoria de alterações relevantes em `audit_logs` (quem, quando, o quê, antes/depois, IP).
- LGPD: base legal documentada, política de privacidade, exportação dos dados em JSON/CSV,
  exclusão com prazo e registro, minimização de dados, retenção definida, contratos com
  operadores (Neon, Vercel, Cloudflare, Resend, Asaas).
- Backups: PITR 7 dias + dump diário no R2 com retenção de 30 diários e 12 mensais; teste de
  restauração trimestral registrado.

## 9. Requisitos não funcionais

| Requisito | Meta inicial |
|---|---|
| Tempo de resposta do painel | p95 < 800 ms em consultas paginadas |
| Disponibilidade | 99,5% no primeiro ano |
| Perda máxima de dados | 24 h (backup) / ~5 min (PITR) |
| Usuários simultâneos por tenant | 10 sem degradação perceptível |
| Tenants suportados na arquitetura | milhares (multi-tenant lógico, escala vertical + read replica) |
| Acessibilidade | navegação por teclado, contraste AA, labels em formulários |
| Idiomas | pt-BR; moeda BRL; timezone `America/Sao_Paulo` |

## 10. Decisões registradas (ADRs resumidos)

| # | Decisão | Consequência |
|---|---|---|
| 001 | Postgres único com RLS, não banco por tenant | Operação simples e barata; exige RLS e testes de isolamento rigorosos |
| 002 | Asaas como gateway principal | PIX Automático viável no Brasil; dependência de um fornecedor nacional, mitigada por camada de gateway abstrata |
| 003 | Monólito modular em Next.js | Menos custo e complexidade; exige disciplina de fronteiras entre módulos |
| 004 | Preços/limites/prazos em banco | Admin altera sem deploy; exige cache curto e auditoria |
| 005 | Webhook assíncrono idempotente | Resiste a reenvio e a falha temporária; exige monitoramento de eventos travados |
| 006 | Hobby da Vercel descartado | Custo de ~US$ 20/mês é inevitável para uso comercial |
| 007 | Estoque como livro-razão append-only + saldo | Histórico confiável e auditável; saldo é derivado, nunca editado à mão |

## 11. Riscos conhecidos e mitigação

| Risco | Impacto | Mitigação |
|---|---|---|
| Aprovação de conta no Asaas (CNPJ/KYC) atrasar | Bloqueia cobrança real | Iniciar onboarding do gateway já na Fase 02; modo sandbox até aprovação |
| Vazamento entre tenants | Crítico reputacional/legal | RLS + FK composta + testes automatizados de isolamento no CI |
| PIX Automático ainda em adoção | Menos adesão à recorrência automática | Oferecer também cartão e PIX manual por fatura; lembrete por e-mail/WhatsApp |
| Automação de cobrança aprovada juridicamente | Risco de cobrança indevida | Régua em modo aviso até parecer jurídico; prazos configuráveis |
| Dependência de um único provedor de banco | Indisponibilidade | Backup externo diário + Postgres padrão (portável) |
| Aumento de custo de compute no Neon | Margem | Alerta de gasto, scale-to-zero, índices e paginação desde o início |

## 12. O que esta fase NÃO decide

- Layout visual final e identidade da empresa (nome/marca ainda não definidos).
- Meio de pagamento alternativo (cartão de crédito recorrente está coberto; boleto é opcional).
- Canal de WhatsApp automatizado (previsto para fase posterior; o MVP usa link `wa.me`).
- Aplicativo mobile nativo (a plataforma será responsiva; app fica fora do escopo inicial).
