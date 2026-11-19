import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

/**
 * Executa as migrations e as políticas RLS em um PostgreSQL real (WASM).
 *
 * Isto prova que o SQL aplica e que as políticas isolam — coisa que typecheck
 * não prova. Não substitui o teste contra o Neon (conexão pooled, role de
 * runtime, latência), mas roda em qualquer máquina, sem Docker.
 */

const MIGRATIONS_DIR = join(process.cwd(), "src/db/migrations");
const POLICIES_FILE = join(process.cwd(), "src/db/policies/tenant_isolation.sql");

const TENANT_A = "0198f0aa-0000-7000-8000-00000000000a";
const TENANT_B = "0198f0aa-0000-7000-8000-00000000000b";
const PLAN_ID = "0198f0aa-0000-7000-8000-0000000000p1".replace("p1", "01");
const SUB_B = "0198f0aa-0000-7000-8000-0000000000b1";
const INVITE_HASH = "a".repeat(64);

let db: PGlite;

async function setContext(tenantId: string | null): Promise<void> {
  await db.query("select set_config('app.tenant_id', $1, false)", [tenantId ?? ""]);
}

async function setPlatformAdmin(userId: string | null): Promise<void> {
  await db.query("select set_config('app.platform_admin_id', $1, false)", [userId ?? ""]);
}

async function countInvoices(): Promise<number> {
  const result = await db.query<{ total: number }>(
    "select count(*)::int as total from invoices",
  );
  return result.rows[0]?.total ?? -1;
}

beforeAll(async () => {
  db = new PGlite();

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) await db.exec(statement);
    }
  }

  await db.exec(readFileSync(POLICIES_FILE, "utf8"));

  // Dados mínimos: dois estabelecimentos e uma fatura real do B.
  await db.exec(`
    insert into tenants (id, slug, trade_name) values
      ('${TENANT_A}', 'padaria-a', 'Padaria A'),
      ('${TENANT_B}', 'padaria-b', 'Padaria B');

    insert into plans (id, code, name, price_cents, activation_fee_cents)
      values ('${PLAN_ID}', 'ESSENCIAL', 'Essencial', 3990, 3990);

    insert into subscriptions (id, tenant_id, plan_id, status, price_cents, activation_fee_cents)
      values ('${SUB_B}', '${TENANT_B}', '${PLAN_ID}', 'ACTIVE', 3990, 3990);

    insert into "user" (id, name, email, email_verified)
      values ('platform-user-1', 'Proprietário', 'admin@example.com', true);

    insert into platform_admins (id, user_id, role, mfa_required)
      values ('0198f0aa-0000-7000-8000-0000000000a1', 'platform-user-1', 'OWNER', true);
  `);

  // Superusuário ignora RLS mesmo com FORCE: as asserções rodam como o role
  // de runtime, que é quem a aplicação usa.
  await db.exec("set role app_runtime");

  await setContext(TENANT_B);
  await db.exec(`
    insert into invoices (id, tenant_id, subscription_id, kind, status, plan_amount_cents,
                          activation_amount_cents, total_cents, due_date)
    values ('0198f0aa-0000-7000-8000-0000000000d1', '${TENANT_B}', '${SUB_B}', 'INITIAL',
            'OPEN', 3990, 3990, 7980, '2026-12-10');

    insert into invitations (id, tenant_id, email, role, token_hash, expires_at)
    values ('0198f0aa-0000-7000-8000-0000000000e1', '${TENANT_B}', 'convidado@example.com',
            'STAFF', '${INVITE_HASH}', now() + interval '7 days');
  `);
  await setContext(null);
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe("migrations + RLS em PostgreSQL real", () => {
  it("aplica todas as migrations e marca RLS como FORCE nas tabelas de negócio", async () => {
    const result = await db.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select relname, relrowsecurity, relforcerowsecurity
         from pg_class
        where relname in ('products','categories','invoices','memberships','product_price_history','invitations')`,
    );

    expect(result.rows).toHaveLength(6);
    for (const row of result.rows) {
      expect(row.relrowsecurity, row.relname).toBe(true);
      expect(row.relforcerowsecurity, row.relname).toBe(true);
    }
  });

  it("sem contexto de tenant, nenhuma fatura é visível", async () => {
    await setContext(null);
    expect(await countInvoices()).toBe(0);
  });

  it("sessão de plataforma é única por hash de token", async () => {
    await setContext(null);

    const first = await db.query<{ id: string }>(`
      insert into platform_sessions (id, user_id, token_hash, expires_at)
      values ('0198f0aa-0000-7000-8000-0000000000a2', 'platform-user-1', 'hash-unico-1',
              now() + interval '8 hours')
      on conflict (token_hash) do nothing
      returning id
    `);
    expect(first.rows).toHaveLength(1);

    const duplicate = await db.query<{ id: string }>(`
      insert into platform_sessions (id, user_id, token_hash, expires_at)
      values ('0198f0aa-0000-7000-8000-0000000000a3', 'platform-user-1', 'hash-unico-1',
              now() + interval '8 hours')
      on conflict (token_hash) do nothing
      returning id
    `);
    expect(duplicate.rows).toHaveLength(0);
  });

  it("auditoria global só aparece no contexto de plataforma", async () => {
    await setContext(null);
    await setPlatformAdmin(null);

    await expect(
      db.exec(`
        insert into audit_logs (id, actor_type, action, entity_type)
        values ('0198f0aa-0000-7000-8000-0000000000a4', 'ADMIN', 'plan.updated', 'plan')
      `),
    ).rejects.toThrow();

    await setPlatformAdmin("platform-user-1");
    const inserted = await db.query<{ id: string }>(`
      insert into audit_logs (id, actor_type, action, entity_type, after)
      values ('0198f0aa-0000-7000-8000-0000000000a5', 'ADMIN', 'plan.updated', 'plan',
              '{"priceCents":3990}'::jsonb)
      returning id
    `);
    expect(inserted.rows).toHaveLength(1);

    const visible = await db.query<{ total: number }>(
      "select count(*)::int as total from audit_logs where actor_type = 'ADMIN'",
    );
    expect(visible.rows[0]?.total).toBe(1);

    await setPlatformAdmin(null);
    const hidden = await db.query<{ total: number }>(
      "select count(*)::int as total from audit_logs where actor_type = 'ADMIN'",
    );
    expect(hidden.rows[0]?.total).toBe(0);
  });

  it("tenant A não enxerga a fatura do tenant B", async () => {
    await setContext(TENANT_A);
    expect(await countInvoices()).toBe(0);
  });

  it("tenant B enxerga apenas a própria fatura", async () => {
    await setContext(TENANT_B);
    expect(await countInvoices()).toBe(1);
  });

  it("insert com tenant_id de outro estabelecimento é recusado", async () => {
    await setContext(TENANT_A);
    await expect(
      db.exec(`
        insert into invoices (id, tenant_id, subscription_id, kind, status, total_cents, due_date)
        values ('0198f0aa-0000-7000-8000-0000000000d2', '${TENANT_B}', '${SUB_B}',
                'RENEWAL', 'OPEN', 3990, '2027-01-10')
      `),
    ).rejects.toThrow();
  });

  it("tenant_id é imutável (trigger)", async () => {
    await setContext(TENANT_B);
    await expect(
      db.exec(`update invoices set tenant_id = '${TENANT_A}'`),
    ).rejects.toThrow(/imut/i);

    expect(await countInvoices()).toBe(1);
  });

  it("convite só é legível com o hash do token, e só se pendente", async () => {
    await setContext(null);

    await db.query("select set_config('app.invite_token_hash', $1, false)", ["b".repeat(64)]);
    const wrong = await db.query("select id from invitations");
    expect(wrong.rows).toHaveLength(0);

    await db.query("select set_config('app.invite_token_hash', $1, false)", [INVITE_HASH]);
    const right = await db.query<{ email: string }>("select email from invitations");
    expect(right.rows).toHaveLength(1);
    expect(right.rows[0]?.email).toBe("convidado@example.com");

    await db.query("select set_config('app.invite_token_hash', '', false)");
  });

  it("aceitar convite (UPDATE) exige contexto de tenant, não só o token", async () => {
    await setContext(null);
    await db.query("select set_config('app.invite_token_hash', $1, false)", [INVITE_HASH]);

    await expect(
      db.exec("update invitations set accepted_at = now()"),
    ).rejects.toThrow();

    await db.query("select set_config('app.invite_token_hash', '', false)");
  });

  it("produto não pode apontar para categoria de outro tenant (FK composta)", async () => {
    await setContext(TENANT_A);
    await db.exec(`
      insert into categories (id, tenant_id, name, slug)
      values ('0198f0aa-0000-7000-8000-0000000000c1', '${TENANT_A}', 'Pães', 'paes')
    `);

    await setContext(TENANT_B);
    await expect(
      db.exec(`
        insert into products (id, tenant_id, category_id, name, slug, price_cents)
        values ('0198f0aa-0000-7000-8000-0000000000f1', '${TENANT_B}',
                '0198f0aa-0000-7000-8000-0000000000c1', 'Pão', 'pao', 100)
      `),
    ).rejects.toThrow();

    // A categoria de A também não é visível para B.
    const visible = await db.query("select id from categories");
    expect(visible.rows).toHaveLength(0);
  });

  it("estoque tem RLS com FORCE nas três tabelas", async () => {
    const result = await db.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select relname, relrowsecurity, relforcerowsecurity
         from pg_class
        where relname in ('ingredients','stock_movements','stock_balances')`,
    );

    expect(result.rows).toHaveLength(3);
    for (const row of result.rows) {
      expect(row.relrowsecurity, row.relname).toBe(true);
      expect(row.relforcerowsecurity, row.relname).toBe(true);
    }
  });

  it("insumo e saldo de A não aparecem para B", async () => {
    await setContext(TENANT_A);
    await db.exec(`
      insert into ingredients (id, tenant_id, name, unit, min_stock)
      values ('0198f0aa-0000-7000-8000-0000000000a2', '${TENANT_A}', 'Farinha', 'KG', 5);

      insert into stock_balances (tenant_id, item_type, item_id, quantity)
      values ('${TENANT_A}', 'INGREDIENT', '0198f0aa-0000-7000-8000-0000000000a2', 10);
    `);

    await setContext(TENANT_B);
    const ingredients = await db.query("select id from ingredients");
    const balances = await db.query("select item_id from stock_balances");
    expect(ingredients.rows).toHaveLength(0);
    expect(balances.rows).toHaveLength(0);

    // Gravar saldo em nome de A a partir de B é recusado pelo WITH CHECK.
    await expect(
      db.exec(`
        insert into stock_balances (tenant_id, item_type, item_id, quantity)
        values ('${TENANT_A}', 'INGREDIENT', '0198f0aa-0000-7000-8000-0000000000a2', 10)
      `),
    ).rejects.toThrow();
  });

  it("saldo negativo é recusado pelo banco, mesmo com a aplicação errando a conta", async () => {
    await setContext(TENANT_A);
    await expect(
      db.exec(`
        insert into stock_balances (tenant_id, item_type, item_id, quantity)
        values ('${TENANT_A}', 'INGREDIENT', '0198f0aa-0000-7000-8000-0000000000a3', -1)
      `),
    ).rejects.toThrow();
  });

  it("atualização condicional do saldo não deixa sair abaixo de zero", async () => {
    await setContext(TENANT_A);
    await db.exec(`
      update stock_balances set quantity = 1
       where item_type = 'INGREDIENT' and item_id = '0198f0aa-0000-7000-8000-0000000000a2'
    `);

    // Mesmo padrão do serviço: a linha proposta do INSERT é não negativa e o
    // sinal é aplicado no UPDATE, com a condição de saldo no WHERE.
    const insufficient = await db.query(
      `insert into stock_balances (tenant_id, item_type, item_id, quantity)
       values ('${TENANT_A}', 'INGREDIENT', '0198f0aa-0000-7000-8000-0000000000a2', 0)
       on conflict (tenant_id, item_type, item_id)
       do update set quantity = stock_balances.quantity + (-2)
        where stock_balances.quantity + (-2) >= 0
       returning quantity`,
    );
    expect(insufficient.rows).toHaveLength(0);

    const ok = await db.query<{ quantity: string }>(
      `insert into stock_balances (tenant_id, item_type, item_id, quantity)
       values ('${TENANT_A}', 'INGREDIENT', '0198f0aa-0000-7000-8000-0000000000a2', 0)
       on conflict (tenant_id, item_type, item_id)
       do update set quantity = stock_balances.quantity + (-1)
        where stock_balances.quantity + (-1) >= 0
       returning quantity`,
    );
    expect(ok.rows[0]?.quantity).toBe("0.000");
  });

  it("movimento de estoque é imutável (sem UPDATE/DELETE para o runtime)", async () => {
    await setContext(TENANT_A);
    await db.exec(`
      insert into stock_movements (id, tenant_id, item_type, item_id, movement_type, quantity,
                                   unit_cost_cents, reason, created_by)
      values ('0198f0aa-0000-7000-8000-0000000000a4', '${TENANT_A}', 'INGREDIENT',
              '0198f0aa-0000-7000-8000-0000000000a2', 'IN', 10, 450,
              'compra inicial', 'user-teste')
    `);

    await expect(
      db.exec("update stock_movements set quantity = 99"),
    ).rejects.toThrow();

    const grants = await db.query<{ privilege_type: string }>(
      `select privilege_type
         from information_schema.role_table_grants
        where table_name in ('stock_movements','stock_balances') and grantee = 'app_runtime'
        order by privilege_type`,
    );
    const privileges = grants.rows.map((row) => row.privilege_type);
    expect(privileges).toContain("SELECT");
    expect(privileges).toContain("INSERT");
    expect(privileges).not.toContain("DELETE");
  });

  it("produção tem RLS com FORCE nas quatro tabelas", async () => {
    const result = await db.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select relname, relrowsecurity, relforcerowsecurity
         from pg_class
        where relname in ('recipes','recipe_items','production_batches','production_losses')`,
    );

    expect(result.rows).toHaveLength(4);
    for (const row of result.rows) {
      expect(row.relrowsecurity, row.relname).toBe(true);
      expect(row.relforcerowsecurity, row.relname).toBe(true);
    }
  });

  it("ficha, item e fornada de A não aparecem para B", async () => {
    await setContext(TENANT_A);
    await db.exec(`
      insert into products (id, tenant_id, name, slug, price_cents)
      values ('0198f0aa-0000-7000-8000-0000000000f2', '${TENANT_A}', 'Pão francês', 'pao-frances', 50);

      insert into recipes (id, tenant_id, product_id, name, yield_quantity)
      values ('0198f0aa-0000-7000-8000-0000000000aa', '${TENANT_A}',
              '0198f0aa-0000-7000-8000-0000000000f2', 'Ficha do pão', 100);

      insert into recipe_items (id, tenant_id, recipe_id, ingredient_id, quantity, unit)
      values ('0198f0aa-0000-7000-8000-0000000000ab', '${TENANT_A}',
              '0198f0aa-0000-7000-8000-0000000000aa',
              '0198f0aa-0000-7000-8000-0000000000a2', 5, 'KG');

      insert into production_batches (id, tenant_id, recipe_id, planned_quantity)
      values ('0198f0aa-0000-7000-8000-0000000000ac', '${TENANT_A}',
              '0198f0aa-0000-7000-8000-0000000000aa', 100);

      insert into production_losses (id, tenant_id, batch_id, quantity, reason, cost_cents)
      values ('0198f0aa-0000-7000-8000-0000000000ad', '${TENANT_A}',
              '0198f0aa-0000-7000-8000-0000000000ac', 5, 'assou demais', 250);
    `);

    await setContext(TENANT_B);
    for (const table of ["recipes", "recipe_items", "production_batches", "production_losses"]) {
      const visible = await db.query(`select id from ${table}`);
      expect(visible.rows, table).toHaveLength(0);
    }

    // O WITH CHECK recusa gravar uma ficha em nome de A a partir de B.
    await expect(
      db.exec(`
        insert into recipes (id, tenant_id, product_id, name, yield_quantity)
        values ('0198f0aa-0000-7000-8000-0000000000ba', '${TENANT_A}',
                '0198f0aa-0000-7000-8000-0000000000f2', 'Ficha invasora', 10)
      `),
    ).rejects.toThrow();
  });

  it("item de ficha não pode apontar para insumo de outro tenant (FK composta)", async () => {
    await setContext(TENANT_B);

    await expect(
      db.exec(`
        insert into recipe_items (id, tenant_id, recipe_id, ingredient_id, quantity, unit)
        values ('0198f0aa-0000-7000-8000-0000000000bb', '${TENANT_B}',
                '0198f0aa-0000-7000-8000-0000000000aa',
                '0198f0aa-0000-7000-8000-0000000000a2', 1, 'KG')
      `),
    ).rejects.toThrow();
  });

  it("movimentos de produção são aceitos e continuam append-only", async () => {
    await setContext(TENANT_A);
    await db.exec(`
      insert into stock_movements (id, tenant_id, item_type, item_id, movement_type, quantity,
                                   unit_cost_cents, reference_type, reference_id, created_by)
      values ('0198f0aa-0000-7000-8000-0000000000ae', '${TENANT_A}', 'INGREDIENT',
              '0198f0aa-0000-7000-8000-0000000000a2', 'PRODUCTION_CONSUMPTION', 6, 450,
              'production_batch', '0198f0aa-0000-7000-8000-0000000000ac', 'user-teste'),
             ('0198f0aa-0000-7000-8000-0000000000af', '${TENANT_A}', 'PRODUCT',
              '0198f0aa-0000-7000-8000-0000000000f2', 'PRODUCTION_OUTPUT', 100, 30,
              'production_batch', '0198f0aa-0000-7000-8000-0000000000ac', 'user-teste');
    `);

    await expect(
      db.exec("update stock_movements set quantity = 1 where movement_type in ('PRODUCTION_CONSUMPTION','PRODUCTION_OUTPUT')"),
    ).rejects.toThrow();

    await expect(
      db.exec("delete from stock_movements where movement_type = 'PRODUCTION_OUTPUT'"),
    ).rejects.toThrow();

    const movements = await db.query("select id from stock_movements where reference_id = '0198f0aa-0000-7000-8000-0000000000ac'");
    expect(movements.rows).toHaveLength(2);
  });

  it("perdas de produção são append-only (sem UPDATE/DELETE para o runtime)", async () => {
    const grants = await db.query<{ privilege_type: string }>(
      `select privilege_type
         from information_schema.role_table_grants
        where table_name = 'production_losses' and grantee = 'app_runtime'`,
    );
    const privileges = grants.rows.map((row) => row.privilege_type);
    expect(privileges).toContain("SELECT");
    expect(privileges).toContain("INSERT");
    expect(privileges).not.toContain("UPDATE");
    expect(privileges).not.toContain("DELETE");

    await setContext(TENANT_A);
    await expect(
      db.exec("update production_losses set quantity = 99"),
    ).rejects.toThrow();
    await expect(
      db.exec("delete from production_losses"),
    ).rejects.toThrow();
  });

  it("histórico de preço é append-only (sem UPDATE/DELETE)", async () => {
    const result = await db.query<{ privilege_type: string }>(
      `select privilege_type
         from information_schema.role_table_grants
        where table_name = 'product_price_history' and grantee = 'app_runtime'`,
    );

    const grants = result.rows.map((row) => row.privilege_type);
    expect(grants).toContain("SELECT");
    expect(grants).toContain("INSERT");
    expect(grants).not.toContain("UPDATE");
    expect(grants).not.toContain("DELETE");
  });

  it("assinatura não pode ter duas faturas abertas", async () => {
    await setContext(TENANT_B);

    await expect(
      db.exec(`
        insert into invoices (id, tenant_id, subscription_id, kind, status,
                              plan_amount_cents, total_cents, due_date)
        values ('0198f0aa-0000-7000-8000-0000000000d5', '${TENANT_B}', '${SUB_B}',
                'RENEWAL', 'OPEN', 3990, 3990, '2027-02-10')
      `),
    ).rejects.toThrow();

    // Rascunho ainda não é cobrança aberta; a constraint só fecha OPEN/OVERDUE.
    await db.exec(`
      insert into invoices (id, tenant_id, subscription_id, kind, status,
                            plan_amount_cents, total_cents, due_date)
      values ('0198f0aa-0000-7000-8000-0000000000d6', '${TENANT_B}', '${SUB_B}',
              'INITIAL', 'DRAFT', 3990, 3990, '2027-02-10')
    `);
  });

  it("pagamento do gateway é único por (gateway, gateway_payment_id)", async () => {
    await setContext(TENANT_B);
    await db.exec(`
      insert into payments (id, tenant_id, invoice_id, gateway, gateway_payment_id,
                            method, amount_cents, status)
      values ('0198f0aa-0000-7000-8000-0000000000e2', '${TENANT_B}',
              '0198f0aa-0000-7000-8000-0000000000d1', 'ASAAS', 'pay_teste_1',
              'PIX', 7980, 'CONFIRMED')
    `);

    await expect(
      db.exec(`
        insert into payments (id, tenant_id, invoice_id, gateway, gateway_payment_id,
                              method, amount_cents, status)
        values ('0198f0aa-0000-7000-8000-0000000000e3', '${TENANT_B}',
                '0198f0aa-0000-7000-8000-0000000000d1', 'ASAAS', 'pay_teste_1',
                'PIX', 7980, 'CONFIRMED')
      `),
    ).rejects.toThrow();

    const count = await db.query<{ total: number }>(
      "select count(*)::int as total from payments where gateway_payment_id = 'pay_teste_1'",
    );
    expect(count.rows[0]?.total).toBe(1);
  });

  it("evento de webhook reenviado não duplica e pode ser marcado como processado", async () => {
    const first = await db.query<{ id: string }>(`
      insert into webhook_events (id, gateway, event_id, event_type, payload, status)
      values ('0198f0aa-0000-7000-8000-0000000000e4', 'ASAAS', 'evt_teste_1',
              'PAYMENT_RECEIVED', '{"id":"evt_teste_1"}'::jsonb, 'RECEIVED')
      on conflict (gateway, event_id) do nothing
      returning id
    `);
    expect(first.rows).toHaveLength(1);

    const duplicate = await db.query<{ id: string }>(`
      insert into webhook_events (id, gateway, event_id, event_type, payload, status)
      values ('0198f0aa-0000-7000-8000-0000000000e5', 'ASAAS', 'evt_teste_1',
              'PAYMENT_RECEIVED', '{"id":"evt_teste_1"}'::jsonb, 'RECEIVED')
      on conflict (gateway, event_id) do nothing
      returning id
    `);
    expect(duplicate.rows).toHaveLength(0);

    const updated = await db.query<{ status: string }>(`
      update webhook_events set status = 'PROCESSED', attempts = attempts + 1,
             processed_at = now()
      where gateway = 'ASAAS' and event_id = 'evt_teste_1'
      returning status
    `);
    expect(updated.rows[0]?.status).toBe("PROCESSED");
  });

  it("notificação da régua é única por dedupe_key", async () => {
    await setContext(TENANT_B);

    const first = await db.query<{ id: string }>(`
      insert into notification_log (id, tenant_id, invoice_id, channel, template,
                                    status, dedupe_key)
      values ('0198f0aa-0000-7000-8000-0000000000f1', '${TENANT_B}',
              '0198f0aa-0000-7000-8000-0000000000d1', 'EMAIL', 'overdue',
              'SCHEDULED', 'invoice:d1:d1:EMAIL')
      on conflict (dedupe_key) do nothing
      returning id
    `);
    expect(first.rows).toHaveLength(1);

    const repeat = await db.query<{ id: string }>(`
      insert into notification_log (id, tenant_id, invoice_id, channel, template,
                                    status, dedupe_key)
      values ('0198f0aa-0000-7000-8000-0000000000f2', '${TENANT_B}',
              '0198f0aa-0000-7000-8000-0000000000d1', 'EMAIL', 'overdue',
              'SCHEDULED', 'invoice:d1:d1:EMAIL')
      on conflict (dedupe_key) do nothing
      returning id
    `);
    expect(repeat.rows).toHaveLength(0);
  });

  it("transição para RESTRICTED fica registrada no histórico", async () => {
    await setContext(TENANT_B);

    await db.exec(`
      update subscriptions set status = 'RESTRICTED', restricted_at = now()
      where id = '${SUB_B}';

      insert into subscription_status_history (id, tenant_id, subscription_id,
                                               from_status, to_status, reason, actor_type)
      values ('0198f0aa-0000-7000-8000-0000000000f3', '${TENANT_B}', '${SUB_B}',
              'PAST_DUE', 'RESTRICTED', 'dunning:6d:RESTRICTED', 'SYSTEM');
    `);

    const history = await db.query<{ to_status: string }>(
      "select to_status from subscription_status_history where subscription_id = $1",
      [SUB_B],
    );
    expect(history.rows.map((row) => row.to_status)).toContain("RESTRICTED");
  });
});
