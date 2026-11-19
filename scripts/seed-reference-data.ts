import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  billingSettings,
  featureDefinitions,
  planFeatures,
  plans,
} from "../src/db/schema/index.js";
import { DEFAULT_DUNNING_SCHEDULE } from "../src/modules/dunning/schedule.js";

/**
 * Dados de REFERÊNCIA (planos, catálogo de features, configuração de cobrança).
 * Não são dados financeiros fictícios: são os valores comerciais reais do
 * projeto, editáveis depois pelo painel global.
 *
 * Idempotente: usa ON CONFLICT DO NOTHING para nunca sobrescrever preço ou
 * limite alterado pelo proprietário.
 */
async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL não definida.");
    process.exit(1);
  }

  const client = postgres(url, { max: 1, onnotice: () => {} });
  const db = drizzle(client, { casing: "snake_case" });

  const features = [
    { key: "catalog.public", name: "Vitrine digital", valueType: "BOOLEAN" },
    { key: "products.max", name: "Produtos cadastrados", valueType: "LIMIT", unitLabel: "produtos" },
    { key: "users.max", name: "Usuários", valueType: "LIMIT", unitLabel: "usuários" },
    { key: "images.per_product", name: "Fotos por produto", valueType: "LIMIT", unitLabel: "fotos" },
    { key: "stock.basic", name: "Controle de estoque", valueType: "BOOLEAN" },
    { key: "stock.full", name: "Estoque completo", valueType: "BOOLEAN" },
    { key: "reports.basic", name: "Relatórios básicos", valueType: "BOOLEAN" },
    { key: "reports.advanced", name: "Relatórios avançados", valueType: "BOOLEAN" },
    { key: "production.enabled", name: "Gestão de produção", valueType: "BOOLEAN" },
    { key: "history.full", name: "Histórico completo", valueType: "BOOLEAN" },
    { key: "export.data", name: "Exportação dos dados", valueType: "BOOLEAN" },
  ] as const;

  await db
    .insert(featureDefinitions)
    .values(features.map((feature) => ({ ...feature })))
    .onConflictDoNothing();

  const plansData = [
    {
      code: "ESSENCIAL",
      name: "Essencial",
      description: "Vitrine digital e administração básica para começar.",
      priceCents: 3990,
      activationFeeCents: 3990,
      sortOrder: 1,
      isFeatured: false,
    },
    {
      code: "PROFISSIONAL",
      name: "Profissional",
      description: "Catálogo ampliado, estoque básico e relatórios.",
      priceCents: 5990,
      activationFeeCents: 3990,
      sortOrder: 2,
      isFeatured: false,
    },
    {
      code: "EMPRESARIAL",
      name: "Empresarial",
      description: "Gestão completa: estoque avançado, produção e relatórios.",
      priceCents: 7990,
      activationFeeCents: 3990,
      sortOrder: 3,
      isFeatured: true,
    },
  ];

  await db.insert(plans).values(plansData).onConflictDoNothing();

  const featureMatrix: Record<string, Record<string, number | boolean | null>> = {
    ESSENCIAL: {
      "catalog.public": true,
      "products.max": 30,
      "users.max": 2,
      "images.per_product": 3,
      "stock.basic": false,
      "stock.full": false,
      "reports.basic": false,
      "reports.advanced": false,
      "production.enabled": false,
      "history.full": false,
      "export.data": true,
    },
    PROFISSIONAL: {
      "catalog.public": true,
      "products.max": 150,
      "users.max": 5,
      "images.per_product": 5,
      "stock.basic": true,
      "stock.full": false,
      "reports.basic": true,
      "reports.advanced": false,
      "production.enabled": false,
      "history.full": false,
      "export.data": true,
    },
    EMPRESARIAL: {
      "catalog.public": true,
      "products.max": 2000,
      "users.max": 20,
      "images.per_product": 10,
      "stock.basic": true,
      "stock.full": true,
      "reports.basic": true,
      "reports.advanced": true,
      "production.enabled": true,
      "history.full": true,
      "export.data": true,
    },
  };

  const savedPlans = await db.select({ id: plans.id, code: plans.code }).from(plans);
  const savedFeatures = await db
    .select({ key: featureDefinitions.key, valueType: featureDefinitions.valueType })
    .from(featureDefinitions);

  const rows = savedPlans.flatMap((plan) => {
    const matrix = featureMatrix[plan.code];
    if (!matrix) return [];

    return savedFeatures
      .filter((feature) => feature.key in matrix)
      .map((feature) => {
        const raw = matrix[feature.key];
        const isBoolean = feature.valueType === "BOOLEAN";
        return {
          planId: plan.id,
          featureKey: feature.key,
          isEnabled: isBoolean ? raw === true : true,
          limitValue: isBoolean ? null : typeof raw === "number" ? raw : null,
        };
      });
  });

  if (rows.length > 0) {
    await db.insert(planFeatures).values(rows).onConflictDoNothing();
  }

  // Política financeira inicia em modo aviso: nada é cobrado nem suspenso
  // antes da validação jurídica.
  await db
    .insert(billingSettings)
    .values({
      id: 1,
      defaultActivationFeeCents: 3990,
      finePercent: "2.00",
      interestPercentMonth: "1.00",
      dunningSchedule: DEFAULT_DUNNING_SCHEDULE,
      restrictAfterDays: 5,
      suspendAfterDays: 10,
      cancelAfterDays: 15,
      enforceRestrictions: false,
    })
    .onConflictDoNothing();

  console.log(
    `Dados de referência inseridos: ${features.length} features, ${plansData.length} planos, ${rows.length} vínculos.`,
  );
  await client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
