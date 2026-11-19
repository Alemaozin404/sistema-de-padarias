# Fase 09 — Endurecimento e lançamento (parcial)

## Entregue em código

### Rate limit

- `src/lib/rate-limit.ts` implementa janela fixa por escopo + identificador, com
  Upstash Redis (REST) quando configurado e fallback em memória.
- Aplicado a login de estabelecimento, recuperação de senha, login do painel global,
  confirmação de 2FA, reautenticação e exportação LGPD.
- Limites padrão: login por IP 20/15 min e por e-mail 5/15 min; reset por e-mail
  3/h e por IP 10/h; 2FA 8/10 min; reauth 5/10 min; exportação 5/h por usuário.
- Identificadores são hashed (SHA-256) antes de virar chave no Redis.

### CSP, HSTS e cabeçalhos

- `src/proxy.ts` gera um nonce por requisição, propaga por `x-nonce` e emite
  `Content-Security-Policy` com `script-src 'self' 'nonce-...'` (+ `unsafe-eval`
  apenas em desenvolvimento), `style-src 'self' 'unsafe-inline'`, `object-src 'none'`,
  `frame-ancestors 'none'` e `form-action 'self'`.
- `next.config.ts` mantém HSTS, `X-Content-Type-Options`, `Referrer-Policy`,
  `X-Frame-Options`, `Permissions-Policy` e `poweredByHeader: false`.
- `allowedDevOrigins` inclui `127.0.0.1` e `localhost` para o dev server do Playwright.

### Exportação LGPD

- `src/modules/lgpd/export.ts` coleta todos os dados do tenant dentro de `withTenant`
  (RLS aplicada): estabelecimento, equipe, catálogo, estoque, produção, assinatura,
  faturas, pagamentos, descontos, notificações e auditoria.
- `src/app/api/lgpd/export/route.ts` exige sessão válida, limita 5 exportações/hora
  por usuário e registra `tenant.data_exported` em `audit_logs`.
- Formatos JSON (arquivo completo) e CSV (uma linha por registro, coluna `dados` em JSON).
- `src/app/(app)/dados/page.tsx` expõe os links de download; acessível inclusive em
  `RESTRICTED`/`SUSPENDED`, pois `requireTenant` não bloqueia por status financeiro.

### Suíte e2e

- Playwright (`playwright.config.ts`) com Chromium, dev server automático na porta 3100.
- `tests/e2e/security-headers.spec.ts`: CSP, HSTS e renderização de login/planos.
- `tests/e2e/login-rate-limit.spec.ts`: bloqueio por rate limit sem banco.
- `tests/e2e/realm-separation.spec.ts`: página de login do admin distinta e, quando há
  `DATABASE_URL`, redirecionamento e negação de exportação sem sessão.

## Ainda pendente (fora do escopo implementado nesta rodada)

- Backup diário para R2 + teste de restore registrado (`backup_runs` já existe no schema,
  mas o job de dump e o registro de restore não foram implementados).
- Política de privacidade, contrato e formulário de contratação/comercial avançado
  (a página `/planos` já apresenta preços vindos do banco).
- Rate limit persistente em Redis é opcional; sem credenciais Upstash usa memória por
  instância (aceitável em desenvolvimento, limitado em produção multi-instância).

## Checklist de segurança (§8 da arquitetura)

- [x] Segredos apenas em variáveis de ambiente do servidor.
- [x] Validação de entrada com Zod em rotas/ações.
- [x] Webhook validado por token + comparação em tempo constante.
- [x] CSP, HSTS, X-Content-Type-Options, Referrer-Policy, anti-CSRF de Server Actions.
- [x] Rate limit de login e reset.
- [x] Auditoria de alterações relevantes.
- [x] Exportação LGPD em JSON/CSV.
- [ ] Upload de imagem com remoção de EXIF e URL assinada (módulo de catálogo pendente de implementação real de upload).
- [ ] Backups PITR + dump diário + restore testado.
- [ ] Política de privacidade publicada.
