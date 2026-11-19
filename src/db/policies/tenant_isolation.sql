-- Isolamento multi-tenant por RLS.
--
-- Contrato:
--   * a aplicação define `app.tenant_id` (e, para resolver o vínculo, `app.user_id`)
--     com set_config(..., true) DENTRO de uma transação;
--   * sem contexto, current_setting(..., true) é NULL e a política nega tudo;
--   * FORCE ROW LEVEL SECURITY garante que nem o owner da tabela escape.
--
-- Jobs administrativos que precisam varrer todos os tenants usam um role próprio
-- com BYPASSRLS (nunca o role da aplicação) ou iteram tenant por tenant.
--
-- Este arquivo é idempotente: pode ser reaplicado a cada migration.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    CREATE ROLE app_runtime NOLOGIN NOBYPASSRLS;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Trigger: `tenant_id` é imutável.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION forbid_tenant_id_change() RETURNS trigger AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'tenant_id é imutável (tabela %)', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Tabelas com isolamento estrito (tenant_id = contexto da sessão).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  strict_tables text[] := ARRAY[
    'subscriptions',
    'subscription_status_history',
    'invoices',
    'payments',
    'notification_log',
    'tenant_discounts',
    'categories',
    'products',
    'product_images'
  ];
BEGIN
  FOREACH t IN ARRAY strict_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)
         WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
      t
    );
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_tenant_immutable ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_tenant_immutable BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION forbid_tenant_id_change()',
      t, t
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_runtime', t);
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- memberships: a política precisa permitir que o usuário descubra seus próprios
-- vínculos antes de existir tenant ativo (login, seletor de estabelecimento).
-- A escrita continua exigindo o tenant no contexto.
-- ---------------------------------------------------------------------------
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON memberships;

CREATE POLICY tenant_isolation ON memberships
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    OR user_id = NULLIF(current_setting('app.user_id', true), '')
  )
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

DROP TRIGGER IF EXISTS trg_memberships_tenant_immutable ON memberships;
CREATE TRIGGER trg_memberships_tenant_immutable BEFORE UPDATE ON memberships
  FOR EACH ROW EXECUTE FUNCTION forbid_tenant_id_change();

GRANT SELECT, INSERT, UPDATE, DELETE ON memberships TO app_runtime;

-- ---------------------------------------------------------------------------
-- audit_logs: append-only e restrito ao tenant.
-- Ações globais da plataforma (tenant_id nulo) são gravadas pela conexão
-- administrativa, fora do contexto de tenant; a aplicação de padaria não as lê.
-- ---------------------------------------------------------------------------
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON audit_logs;

CREATE POLICY tenant_isolation ON audit_logs
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- O realm de plataforma lê a trilha global e grava ações administrativas.
-- O contexto `app.platform_admin_id` só é definido depois de sessão + TOTP +
-- reautenticação validados no servidor; nunca vem do navegador.
DROP POLICY IF EXISTS platform_admin_access ON audit_logs;
CREATE POLICY platform_admin_access ON audit_logs
  USING (NULLIF(current_setting('app.platform_admin_id', true), '') IS NOT NULL)
  WITH CHECK (NULLIF(current_setting('app.platform_admin_id', true), '') IS NOT NULL);

GRANT SELECT, INSERT ON audit_logs TO app_runtime;
-- Sem UPDATE/DELETE: auditoria é append-only.

-- ---------------------------------------------------------------------------
-- invitations: o convidado ainda não tem vínculo, então a leitura do próprio
-- convite não pode exigir tenant ativo.
--
-- A segunda condição usa `app.invite_token_hash`, definido pela aplicação só
-- depois de receber o token do link. Quem não conhece o hash (256 bits) não lê
-- nada, e a política só abre convites pendentes e não expirados.
-- ---------------------------------------------------------------------------
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON invitations;

CREATE POLICY tenant_isolation ON invitations
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    OR (
      token_hash = NULLIF(current_setting('app.invite_token_hash', true), '')
      AND accepted_at IS NULL
      AND expires_at > now()
    )
  )
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

DROP TRIGGER IF EXISTS trg_invitations_tenant_immutable ON invitations;
CREATE TRIGGER trg_invitations_tenant_immutable BEFORE UPDATE ON invitations
  FOR EACH ROW EXECUTE FUNCTION forbid_tenant_id_change();

GRANT SELECT, INSERT, UPDATE, DELETE ON invitations TO app_runtime;

-- ---------------------------------------------------------------------------
-- product_price_history: append-only, como a auditoria. Corrigir preço é inserir
-- um novo registro; o histórico nunca é reescrito.
-- ---------------------------------------------------------------------------
ALTER TABLE product_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_price_history FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON product_price_history;

CREATE POLICY tenant_isolation ON product_price_history
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

DROP TRIGGER IF EXISTS trg_product_price_history_tenant_immutable ON product_price_history;
CREATE TRIGGER trg_product_price_history_tenant_immutable BEFORE UPDATE ON product_price_history
  FOR EACH ROW EXECUTE FUNCTION forbid_tenant_id_change();

GRANT SELECT, INSERT ON product_price_history TO app_runtime;

-- ---------------------------------------------------------------------------
-- ingredients: cadastro mutável do insumo. O saldo NÃO vive aqui — vive em
-- `stock_balances`, atualizado transacionalmente pelo movimento.
-- ---------------------------------------------------------------------------
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredients FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON ingredients;

CREATE POLICY tenant_isolation ON ingredients
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

DROP TRIGGER IF EXISTS trg_ingredients_tenant_immutable ON ingredients;
CREATE TRIGGER trg_ingredients_tenant_immutable BEFORE UPDATE ON ingredients
  FOR EACH ROW EXECUTE FUNCTION forbid_tenant_id_change();

GRANT SELECT, INSERT, UPDATE, DELETE ON ingredients TO app_runtime;

-- ---------------------------------------------------------------------------
-- stock_balances: saldo derivado dos movimentos. A aplicação lê e atualiza,
-- mas nunca apaga um saldo; encerrar o tenant remove por cascade.
-- ---------------------------------------------------------------------------
ALTER TABLE stock_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_balances FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON stock_balances;

CREATE POLICY tenant_isolation ON stock_balances
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON stock_balances TO app_runtime;
-- Sem DELETE: saldo negativo ou remoção manual não são permitidos.

-- ---------------------------------------------------------------------------
-- stock_movements: livro-razão append-only. Corrigir é lançar um ajuste.
-- ---------------------------------------------------------------------------
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON stock_movements;

CREATE POLICY tenant_isolation ON stock_movements
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

DROP TRIGGER IF EXISTS trg_stock_movements_tenant_immutable ON stock_movements;
CREATE TRIGGER trg_stock_movements_tenant_immutable BEFORE UPDATE ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION forbid_tenant_id_change();

GRANT SELECT, INSERT ON stock_movements TO app_runtime;
-- Sem UPDATE/DELETE: movimento é imutável.

-- ---------------------------------------------------------------------------
-- recipes / recipe_items: ficha técnica. Ambas carregam tenant_id e FK
-- composta, então uma receita não liga produto ou insumo de outro tenant.
-- ---------------------------------------------------------------------------
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON recipes;

CREATE POLICY tenant_isolation ON recipes
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

DROP TRIGGER IF EXISTS trg_recipes_tenant_immutable ON recipes;
CREATE TRIGGER trg_recipes_tenant_immutable BEFORE UPDATE ON recipes
  FOR EACH ROW EXECUTE FUNCTION forbid_tenant_id_change();

GRANT SELECT, INSERT, UPDATE, DELETE ON recipes TO app_runtime;

ALTER TABLE recipe_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON recipe_items;

CREATE POLICY tenant_isolation ON recipe_items
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

DROP TRIGGER IF EXISTS trg_recipe_items_tenant_immutable ON recipe_items;
CREATE TRIGGER trg_recipe_items_tenant_immutable BEFORE UPDATE ON recipe_items
  FOR EACH ROW EXECUTE FUNCTION forbid_tenant_id_change();

GRANT SELECT, INSERT, UPDATE, DELETE ON recipe_items TO app_runtime;

-- ---------------------------------------------------------------------------
-- production_batches: status muda por UPDATE (concluir/cancelar). Sem DELETE.
-- ---------------------------------------------------------------------------
ALTER TABLE production_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_batches FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON production_batches;

CREATE POLICY tenant_isolation ON production_batches
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

DROP TRIGGER IF EXISTS trg_production_batches_tenant_immutable ON production_batches;
CREATE TRIGGER trg_production_batches_tenant_immutable BEFORE UPDATE ON production_batches
  FOR EACH ROW EXECUTE FUNCTION forbid_tenant_id_change();

GRANT SELECT, INSERT, UPDATE ON production_batches TO app_runtime;

-- ---------------------------------------------------------------------------
-- production_losses: append-only, como os movimentos de estoque.
-- ---------------------------------------------------------------------------
ALTER TABLE production_losses ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_losses FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON production_losses;

CREATE POLICY tenant_isolation ON production_losses
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON production_losses TO app_runtime;

-- ---------------------------------------------------------------------------
-- Privilégios do role de runtime.
--
-- RLS não substitui GRANT: um role sem privilégio não lê nem a própria linha.
-- Estes são os mínimos para login, cadastro e seleção de estabelecimento.
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenants TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON "user", session, account, verification TO app_runtime;

-- ---------------------------------------------------------------------------
-- Tabelas globais: sem RLS. O controle é na camada de serviço (somente admin
-- escreve em planos, preços e configurações de cobrança).
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON plans, plan_features TO app_runtime;
GRANT SELECT ON feature_definitions, billing_settings TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON coupons, expenses, platform_settings TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON webhook_events TO app_runtime;
GRANT SELECT, INSERT ON security_events, system_health_checks TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON backup_runs TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON platform_incidents TO app_runtime;

-- Realm de plataforma: sessão própria e leitura do vínculo administrativo.
GRANT SELECT ON platform_admins TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON platform_sessions TO app_runtime;
