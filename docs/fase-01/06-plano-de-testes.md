# Fase 01 — Plano de Testes

> O briefing exige testes para **autenticação, separação de clientes, cobranças, planos e
> suspensão**. Este documento define onde cada teste roda, com que banco e qual é o critério de
> aprovação. Testes não são opcionais em nenhuma fase.

## 1. Camadas e ferramentas

| Camada | O que cobre | Ferramenta | Banco |
|---|---|---|---|
| Unitária | Dinheiro, encargos, régua, entitlements, guards de permissão | Vitest (puro, sem I/O) | nenhum |
| Integração | RLS, repositórios, services, webhook, migrations | Vitest + driver `postgres` | PostgreSQL real (branch do Neon) |
| E2E | Cadastro → produtos → vitrine → pagamento → suspensão | Playwright (Fase 09) | banco de teste + gateway sandbox |

Regra: teste unitário nunca toca banco; teste de integração nunca usa mock de RLS. **RLS
mockado não prova nada** — o ponto do teste é justamente o comportamento do PostgreSQL.

## 2. Como o banco de teste é obtido

1. Branch de banco no Neon criada a partir do schema vazio (`DATABASE_URL_UNPOOLED` de teste).
2. `drizzle-kit migrate` + `npm run db:policies` aplicam migrations e políticas.
3. Cada suíte roda em transação revertida ao final, ou em schema temporário descartado.
4. `DATABASE_URL` ausente → suítes de integração são **puladas com aviso**, nunca marcadas como
   aprovadas. O CI da Fase 09 exige que estejam verdes.

## 3. Autenticação

| # | Cenário | Esperado |
|---|---|---|
| A1 | Senha com hash Argon2id no banco | nenhum campo em texto puro; hash verificável |
| A2 | Login com senha errada 5× | throttling ativo, mensagem genérica (não revela se o e-mail existe) |
| A3 | Sessão após logout | token revogado no banco; requisição seguinte recebe 401 |
| A4 | Cookie de sessão | `httpOnly`, `Secure` em produção, `SameSite=Lax` |
| A5 | Reset de senha | token de uso único, expira, hash no banco, invalida sessões antigas |
| A6 | Usuário de padaria em rota `/admin` | 403, mesmo sendo `OWNER` do tenant |
| A7 | Admin da plataforma sem 2FA recente | bloqueado em ação sensível |

## 4. Separação de clientes (isolamento)

Teste obrigatório por recurso (produto, categoria, insumo, movimento, receita, fornada, fatura,
membro da equipe):

| # | Cenário | Esperado |
|---|---|---|
| I1 | Tenant A lê recurso de B por ID direto | 404 (não 403, para não confirmar existência) |
| I2 | Tenant A atualiza recurso de B | 404 e nenhuma linha alterada |
| I3 | Tenant A cria filho apontando para pai de B | violação de FK/RLS, erro de negócio |
| I4 | Query sem `SET LOCAL app.tenant_id` | zero linhas (política nega tudo) |
| I5 | Tentativa de `UPDATE` de `tenant_id` | bloqueada por trigger |
| I6 | `tenant_id` vindo do body/query string | ignorado; sempre o da sessão |
| I7 | Vitrine pública | view expõe só tenant do slug; sem custo, estoque ou equipe |
| I8 | Contagem de limite do plano | sempre filtrada por tenant (B não consome cota de A) |

## 5. Planos e permissões

| # | Cenário | Esperado |
|---|---|---|
| P1 | Criar produto além do limite do plano | erro de negócio `PLAN_LIMIT_REACHED`, nada gravado |
| P2 | Feature desabilitada no plano | service nega antes de tocar o banco; UI esconde, servidor decide |
| P3 | Alterar preço do plano | assinatura existente mantém preço contratado (snapshot) |
| P4 | Limite alterado no admin | vale na próxima requisição (cache curto invalidado) |
| P5 | `UNLIMITED` | ausência de limite não confundida com limite zero |
| P6 | Papel `STAFF` | não exclui produto, não vê financeiro do tenant |

## 6. Cobranças

| # | Cenário | Esperado |
|---|---|---|
| C1 | Primeiro pagamento | fatura `INITIAL` = mensalidade + ativação, discriminadas |
| C2 | Renovação | apenas mensalidade, sem ativação |
| C3 | Webhook com token inválido | 401, evento registrado, nada alterado |
| C4 | Mesmo `event_id` 3× | um `payments`, uma transição de estado |
| C5 | Mesmo `gateway_payment_id` em evento diferente | `UNIQUE` impede duplicidade |
| C6 | Checkout abandonado | assinatura permanece `PENDING`; nenhum `PAID` |
| C7 | "Pagamento aprovado" só no navegador | ignorado; estado financeiro não nasce no cliente |
| C8 | Conciliação ativa | cobrança paga no gateway sem webhook é confirmada pelo job |
| C9 | Multa e juros | 2% único + 1%/mês pro rata die, arredondamento para cima no centavo |
| C10 | Juros não duplicados | execuções repetidas do cron de encargos não somam duas vezes |

## 7. Suspensão e retenção de dados

| # | Cenário | Esperado |
|---|---|---|
| S1 | Atraso percorre D+1, D+5, D+10, D+15 | estados e avisos na ordem de `billing_settings` |
| S2 | `RESTRICTED` | escrita operacional negada; leitura e exportação liberadas |
| S3 | `SUSPENDED` | painel operacional bloqueado; financeiro, dados e exportação acessíveis |
| S4 | Pagamento após suspensão | volta a `ACTIVE` com período estendido |
| S5 | Qualquer estado de inadimplência | nenhum dado apagado, nenhuma exportação bloqueada |
| S6 | Prazo alterado no admin | régua seguinte usa o novo valor, sem deploy |

## 8. Critério de aprovação

- `npm test` verde (unitárias e integrações disponíveis).
- `tsc --noEmit` sem erro.
- Nenhuma suíte crítica pulada em release: I1–I4, C3–C7 e S2–S5 são obrigatórias antes de
  qualquer cliente real.
- Falha em teste de isolamento bloqueia o merge, sem exceção.
