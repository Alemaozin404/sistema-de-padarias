# Fase 01 — Previsão de Custos Operacionais

> Valores pesquisados em **novembro/2026** nos sites oficiais. Câmbio assumido: **US$ 1 = R$ 5,40**
> (ajustar quando a conta for aberta). Impostos sobre serviço internacional podem incidir
> (IOF/ISS) e não estão incluídos.

## 1. Custos fixos mensais

| Item | Plano inicial | Custo mensal | Observação |
|---|---|---:|---|
| Vercel | Pro | ~R$ 108 (US$ 20) | Hobby é **não comercial**; Pro inclui 1 usuário |
| Neon Postgres | Launch (uso) | ~R$ 27–110 (US$ 5–20) | Sem mensalidade mínima; US$ 0,106/CU-hora + US$ 0,35/GB-mês; typical ~US$ 15 |
| Cloudflare R2 | Pay-as-you-go | ~R$ 5–25 | 10 GB grátis; US$ 0,015/GB-mês; **egress zero** |
| Resend | Free → Pro | R$ 0 → ~R$ 108 | Free: 3.000 e-mails/mês; Pro: 50.000 |
| Upstash Redis | Free → Pay-as-you-go | R$ 0 → ~R$ 30 | Rate limit e cache |
| Sentry | Free → Team | R$ 0 → ~R$ 140 | Free cobre o início; Team ~US$ 26 |
| Uptime externo | Free | R$ 0 | Verificação de disponibilidade |
| Domínio `.com.br` | Registro.br | ~R$ 4 (R$ 40/ano) | Anual |
| Cloudflare DNS/WAF | Free | R$ 0 | Proxy e TLS |
| **Subtotal enxuto (início)** | | **~R$ 140–180** | Vercel + Neon pequeno + domínio; e-mail/monitor free |
| **Subtotal recomendado (produção)** | | **~R$ 500–560** | Com Resend Pro, Sentry Team, Redis pago |

Observações relevantes:

- **Neon** cobra por consumo, não por tenant. Um banco pequeno com scale-to-zero fica na casa de
  US$ 5–20/mês; um banco sempre ativo com 1 CU custa ~US$ 77/mês só de compute.
- **Vercel** é o item menos elástico no início; banda excedente e execuções de função são cobradas
  à parte. Monitorar o painel de usage desde o primeiro cliente.
- **Asaas** não tem mensalidade; o custo é por transação recebida (ver abaixo).
- Não há servidor, Kubernetes, banco autogerenciado nem licença de software paga.

## 2. Custos variáveis por cliente

Taxas do Asaas (tabela padrão publicada; promoção de R$ 0,99 nos 3 primeiros meses):

| Meio | Custo por cobrança | Sobre o plano Empresarial (R$ 79,90) |
|---|---:|---:|
| PIX / boleto recebido | R$ 1,99 | ~2,5% |
| Cartão de crédito à vista | R$ 0,49 + 2,99% | ~R$ 2,88 (~3,6%) |
| Notificação WhatsApp (opcional) | R$ 0,55 por aviso | depende da régua |

- O **primeiro pagamento** é uma cobrança única (mensalidade + ativação), portanto gera **uma**
  taxa, não duas.
- E-mail transacional: custo desprezível (dezenas de mensagens por cliente/mês).
- Armazenamento de imagens: ~1–5 MB por produto; centenas de clientes ainda ficam em poucos GB.
- Suporte: custo é tempo do proprietário, não infraestrutura — principal custo real no início.

**Premissa para as projeções:** 70% dos clientes pagam por PIX (R$ 1,99) e 30% por cartão
(~R$ 2,30 médio no plano Profissional), resultando em **~R$ 2,08 por cliente/mês**.

## 3. Cenários de receita e margem

Mix assumido: 20% Essencial, 50% Profissional, 30% Empresarial (ARPU ≈ R$ 61,90).
Ativação de R$ 39,90 é receita única, tratada separadamente (não entra no MRR).

| Clientes | MRR | Taxas gateway | Infra mensal | Custos totais | Margem bruta | Margem % |
|---:|---:|---:|---:|---:|---:|---:|
| 10 | R$ 619 | R$ 21 | R$ 160 | R$ 181 | R$ 438 | 71% |
| 30 | R$ 1.857 | R$ 62 | R$ 250 | R$ 312 | R$ 1.545 | 83% |
| 50 | R$ 3.095 | R$ 104 | R$ 350 | R$ 454 | R$ 2.641 | 85% |
| 100 | R$ 6.190 | R$ 208 | R$ 520 | R$ 728 | R$ 5.462 | 88% |
| 300 | R$ 18.570 | R$ 624 | R$ 900 | R$ 1.524 | R$ 17.046 | 92% |
| 1.000 | R$ 61.900 | R$ 2.080 | R$ 2.400 | R$ 4.480 | R$ 57.420 | 93% |

Leitura dos números:

- O **ponto de equilíbrio operacional** fica entre **3 e 9 clientes**, dependendo de manter o
  stack enxuto (R$ 140–180) ou o recomendado (R$ 500–560). Com o stack recomendado e ARPU de
  R$ 61,90, ~9 assinantes cobrem a infraestrutura.
- A receita de ativação (R$ 39,90 por novo cliente) financia o onboarding e melhora o caixa no
  início, mas não deve ser usada para mascarar o MRR.
- A margem melhora com escala porque a infraestrutura cresce em degraus, não linearmente.
- Impostos (Simples Nacional, a definir com contador) **não** estão na tabela. Em faixas iniciais
  do Simples, reserve 6–15% da receita.

## 4. Custos de implantação (uma vez)

| Item | Estimativa | Necessidade |
|---|---:|---|
| CNPJ / contabilidade de abertura | R$ 0–1.500 | obrigatório para Asaas e nota fiscal |
| Registro de domínio | R$ 40/ano | obrigatório |
| Validação jurídica da política de cobrança | R$ 500–2.000 | **antes** de aplicar multa/suspensão |
| Contrato de assinatura (modelo + revisão) | R$ 300–1.500 | recomendado |
| Marca/identidade visual | R$ 0–1.500 | pode começar com identidade simples |
| Conta Asaas (KYC) | R$ 0 | exige CNPJ e documentação |

## 5. Controles de custo obrigatórios

1. **Alerta de gasto** no Neon e na Vercel (orçamento mensal com notificação).
2. `scale-to-zero` habilitado em desenvolvimento e homologação.
3. Paginação e índices desde a primeira listagem; proibido `SELECT *` sem `LIMIT`.
4. Imagens comprimidas no upload (máx. ~1600 px, WebP) para reduzir storage e banda.
5. Cache de leitura pública da vitrine (ISR) para não consultar o banco a cada visita.
6. Branch de banco por PR apenas durante revisão; apagar branches ao mergear.
7. Revisão mensal de usage: Vercel (invocations/banda), Neon (CU-horas), R2 (storage).
8. Nenhum recurso pago contratado antes do primeiro cliente pagante, exceto Vercel Pro e domínio.

## 6. O que pode encarecer rápido

| Gatilho | Efeito | Prevenção |
|---|---|---|
| Vitrine sem cache em campanha de WhatsApp | Picos de função e banco | ISR + cache de borda |
| Imagens em resolução original | Storage e banda | compressão no upload |
| Relatórios sem índice | Compute alto no Neon | índices + agregações pré-calculadas |
| Banco sempre ativo com autoscaling agressivo | US$ 80+/mês | limite de CU e alerta |
| Envio de e-mail para base sem opt-in | reputação e custo | opt-in e supressão de bounce |
| Suporte sem base de conhecimento | tempo do proprietário | docs e onboarding guiado |
