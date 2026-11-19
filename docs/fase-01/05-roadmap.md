# Fase 01 — Roadmap de Execução

> Este documento complementa `01-arquitetura.md`, `02-estrutura-de-pastas.md`,
> `03-modelo-de-dados.md` e `04-custos-operacionais.md`. Ele define **a ordem** de construção,
> o que entra em cada fase e **quando uma fase está concluída** (critério de saída verificável).
> Nenhuma fase começa antes de a anterior atender ao seu critério de saída.

## 1. Regra de sequenciamento

A ordem não é negociável em um ponto: **isolamento e cobrança antes das funcionalidades
operacionais**. Motivo comercial e jurídico.

- Se a vitrine nascer antes do isolamento, um erro de `WHERE` vira vazamento de dados entre
  clientes — o risco reputacional mais caro do produto.
- Se o módulo de estoque nascer antes da cobrança, a plataforma funciona de graça e o travamento
  precisa ser retrofitado em todas as telas depois.
- Produção é a última funcionalidade de negócio porque é a mais complexa (fichas técnicas,
  consumo, custo real) e a de menor impacto na primeira venda, embora seja o diferencial
  competitivo no plano Empresarial.

Regra derivada: **cada fase termina com algo demonstrável a um cliente real**, nunca com
"infraestrutura pronta".

## 2. Visão geral das fases

| Fase | Nome | Entrega demonstrável | Depende de |
|---|---|---|---|
| 01 | Decisão e documentação | Arquitetura, modelo de dados, custos, roadmap | — |
| 02 | Fundação segura | Login, criação de estabelecimento, painel vazio isolado por tenant | 01 |
| 03 | Catálogo e vitrine | Página pública da padaria com produtos reais | 02 |
| 04 | Estoque | Entrada, saída, saldo e alerta de estoque baixo | 03 |
| 05 | Produção | Ficha técnica, fornada concluída e custo calculado | 04 |
| 06 | Assinaturas e cobrança | Fatura gerada + webhook confirmando pagamento real | 02 |
| 07 | Régua e travamento | Estados ACTIVE→SUSPENDED aplicados de fato no painel | 06 |
| 08 | Painel global do proprietário | MRR, inadimplência, gestão de clientes e planos | 06, 07 |
| 09 | Endurecimento e lançamento | Testes completos, LGPD, backups testados, página comercial | todas |

Fases 04 e 06 podem correr em paralelo na prática (uma é produto, outra é receita), desde que a
06 tenha precedência em caso de conflito de tempo — sem cobrança não há empresa.

## 3. Detalhamento

### Fase 02 — Fundação segura

**Objetivo:** provar que o isolamento entre estabelecimentos funciona antes de existir dado
sensível para vazar.

Escopo:

1. Scaffold Next.js (App Router) + TypeScript `strict` + Tailwind; `lib/env.ts` com Zod que falha
   no boot se faltar variável.
2. Schema Drizzle do núcleo: `tenants`, usuários/sessões (Better Auth), `memberships`,
   `platform_admins`, `plans`, `feature_definitions`, `plan_features`, `subscriptions`,
   `audit_logs`.
3. Migrations versionadas + políticas RLS (`ENABLE` + `FORCE`), `UNIQUE (tenant_id, id)` nas
   tabelas pai e FK composta nas filhas.
4. `withTenant(tenantId, fn)` com `SET LOCAL app.tenant_id` em transação; role de runtime sem
   `BYPASSRLS`.
5. Cadastro (user + tenant + membership OWNER + assinatura `PENDING`), login, logout, reset de
   senha, guards `requireUser` / `requireTenant(role)` / `requireAdmin`.
6. `getEntitlements(tenantId)` com feature flags e limites lidos do banco.
7. Testes de isolamento: para cada recurso, tentativa de leitura/escrita com tenant errado
   resulta em 404/403.

**Critério de saída:** dois estabelecimentos criados em ambiente de teste; usuário de A recebe
404 ao pedir recurso de B por ID direto; `withTenant` sem contexto retorna zero linhas;
`npm test` verde; `tsc --noEmit` limpo.

### Fase 03 — Catálogo e vitrine

Escopo: categorias, produtos (CRUD, soft delete, histórico de preço), upload de imagem com URL
assinada, controle de disponibilidade, página pública `/[slug]` com ISR, link de compartilhamento
e botão WhatsApp (`wa.me`), limites de plano aplicados na escrita (ex.: 31º produto no Essencial
retorna erro de negócio).

**Critério de saída:** vitrine pública de um tenant real carregando com cache; produto de outro
tenant não aparece; contagem de produtos respeita o limite do plano; nenhum campo de custo ou
estoque exposto na view pública.

### Fase 04 — Estoque

Escopo: insumos, livro-razão de movimentos (`IN`/`OUT`/`ADJUSTMENT`/`LOSS`), saldo atualizado na
mesma transação, alerta de estoque baixo, estoque zerado, histórico paginado, registro de perdas.

**Critério de saída:** soma dos movimentos confere com o saldo após teste de concorrência
(duas saídas simultâneas não geram saldo negativo indevido); movimento não é editável nem
apagável; correção só por ajuste.

### Fase 05 — Produção

Escopo: ficha técnica com rendimento, planejamento de fornada, conclusão consumindo insumos e
dando entrada no produto acabado, custo real calculado, perdas, comparação produção × vendas
(quando houver vendas registradas), histórico.

**Critério de saída:** concluir uma fornada com estoque insuficiente é bloqueado com erro claro;
concluir com estoque suficiente gera exatamente os movimentos esperados e o custo bate com o
cálculo manual; nada é anunciado como pronto antes de estar funcional.

### Fase 06 — Assinaturas e cobrança

Escopo: checkout no servidor criando cliente + cobrança no gateway, primeiro pagamento
(mensalidade + ativação) discriminado, webhook com validação de token em tempo constante e
idempotência por `(gateway, event_id)`, `payments` com `UNIQUE`, conciliação ativa contra a API
do gateway como segunda fonte de verdade, renovação por cron, pagamento manual registrado pelo
admin.

**Critério de saída:** webhook reenviado 3 vezes gera **um** pagamento; checkout abandonado não
ativa assinatura; assinatura só fica `ACTIVE` após evento validado ou conciliação; `pix_payload`
e valores da fatura conferem com o gateway em sandbox.

### Fase 07 — Régua de cobrança e travamento

Escopo: `billing_settings` (multa, juros, prazos), cron diário gerando renovação e encargos,
régua D-3/D0/D+1/D+5/D+10/D+15 com `dedupe_key`, transições de estado registradas em
`subscription_status_history`, aplicação de `RESTRICTED` (bloqueia escrita operacional) e
`SUSPENDED` (bloqueia painel operacional) preservando leitura, exportação e pagamento.

**Critério de saída:** simulação de 20 dias de atraso percorre os estados na ordem configurada,
gera uma notificação por evento, e em nenhum estado a exportação de dados é bloqueada; reativar
após pagamento confirmado volta a `ACTIVE` com período estendido.

### Fase 08 — Painel global do proprietário

Escopo: realm separado com 2FA obrigatório, MRR, faturamento, ativos, inadimplentes, churn, receita
por plano, gestão de clientes (ativar, suspender, trocar plano), gestão de planos e limites,
cupons e descontos negociados com vigência, registro de pagamento manual, painel de sistema
(status de backup, último restore testado, erros, uptime) e `audit_logs` consultável.

**Critério de saída:** nenhum usuário de padaria acessa `/admin`; toda ação sensível exige
reautenticação e aparece em `audit_logs`; MRR calculado confere com a soma das assinaturas ativas.

### Fase 09 — Endurecimento e lançamento

Escopo: suíte completa (unitária, integração com RLS, e2e dos fluxos críticos), revisão de
permissões, CSP/HSTS/CSRF, rate limit de login, backup diário para R2 + teste de restore
registrado, exportação LGPD em JSON/CSV, política de privacidade e contrato, página comercial com
comparativo dos planos, formulário de contratação e contato por WhatsApp.

**Critério de saída:** restore de backup executado e documentado; exportação completa de um
tenant em um arquivo; página comercial publicada com preços vindos do banco; checklist de
segurança da §8 da arquitetura revisado item a item.

## 4. Bloqueios externos (não são código)

| Bloqueio | Impacta | Ação do proprietário |
|---|---|---|
| CNPJ ativo | Conta no gateway, nota fiscal | Abrir/regularizar empresa |
| Aprovação KYC no Asaas | Cobrança real | Iniciar onboarding na Fase 02 |
| Parecer jurídico sobre multa/juros/suspensão | Fase 07 em produção | Contratar revisão antes do primeiro cliente |
| Definição de preço de ativação | Fase 06 | Confirmar R$ 39,90 ou substituir |
| Domínio e marca | Fase 09 | Registrar domínio; identidade simples basta |

Enquanto esses bloqueios existirem, o sistema opera em sandbox e em modo "aviso" — nunca
cobrando ou suspendendo cliente real com regra não validada.

## 5. O que fica fora do escopo inicial

- App mobile nativo (a plataforma é responsiva).
- WhatsApp automatizado por API (o MVP usa link `wa.me`; envio pago fica para depois do primeiro
  cliente).
- Emissão de nota fiscal no sistema (feita no emissor/contador).
- Integração com PDV, maquininha ou ERP externo.
- Multi-idioma e multi-moeda.
- Aplicativo para garçom/comanda; o módulo de vendas é fase posterior à 09.

## 6. Marcos comerciais

| Marco | Condição | Uso |
|---|---|---|
| Demo vendável | Fim da Fase 03 | Mostrar vitrine funcionando a um dono de padaria |
| Piloto gratuito controlado | Fim da Fase 06 | 1–3 padarias reais, cobrança em sandbox |
| Primeiro cliente pagante | Fim da Fase 07 + KYC + parecer jurídico | Receita recorrente real |
| Operação com carteira | Fim da Fase 08 | Gerir dezenas de assinantes sem planilha |
| Produto lançado | Fim da Fase 09 | Venda aberta com contrato e LGPD |
