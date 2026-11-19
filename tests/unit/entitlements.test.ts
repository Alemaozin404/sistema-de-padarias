import { describe, expect, it } from "vitest";
import {
  SUBSCRIPTION_STATUSES,
  buildEntitlements,
  hasFeature,
  isWithinLimit,
  limitOf,
  type PlanFeatureRow,
  type SubscriptionStatus,
} from "@/modules/plans/entitlements";

const plan = {
  code: "EMPRESARIAL",
  name: "Empresarial",
  priceCents: 7990,
  activationFeeCents: 3990,
};

const features: PlanFeatureRow[] = [
  { featureKey: "products.max", isEnabled: true, limitValue: 30 },
  { featureKey: "stock.full", isEnabled: true, limitValue: null },
  { featureKey: "production.enabled", isEnabled: false, limitValue: null },
];

function entitlementsFor(status: SubscriptionStatus) {
  return buildEntitlements({ plan, planFeatures: features, status });
}

describe("invariante: dados do cliente nunca são reféns", () => {
  it.each(SUBSCRIPTION_STATUSES)("status %s mantém leitura e exportação", (status) => {
    const entitlements = entitlementsFor(status);
    expect(entitlements.access.canReadOwnData).toBe(true);
    expect(entitlements.access.canExportData).toBe(true);
    expect(entitlements.access.canAccessBilling).toBe(true);
  });
});

describe("travamento proporcional", () => {
  it("ativo libera escrita operacional", () => {
    expect(entitlementsFor("ACTIVE").access.canWriteOperational).toBe(true);
  });

  it("atraso ainda não restringe", () => {
    expect(entitlementsFor("PAST_DUE").access.canWriteOperational).toBe(true);
  });

  it("restrito bloqueia escrita mas mantém leitura", () => {
    const access = entitlementsFor("RESTRICTED").access;
    expect(access.canWriteOperational).toBe(false);
    expect(access.canReadOperational).toBe(true);
  });

  it("suspenso bloqueia operação e permite pagar", () => {
    const access = entitlementsFor("SUSPENDED").access;
    expect(access.canReadOperational).toBe(false);
    expect(access.canPay).toBe(true);
  });

  it("pendente não libera operação antes do primeiro pagamento", () => {
    expect(entitlementsFor("PENDING").access.canWriteOperational).toBe(false);
  });

  it("cada estado não ativo tem aviso para a UI", () => {
    for (const status of SUBSCRIPTION_STATUSES) {
      const entitlements = entitlementsFor(status);
      if (status !== "ACTIVE") expect(entitlements.warning).toBeTruthy();
      else expect(entitlements.warning).toBeNull();
    }
  });
});

describe("features e limites", () => {
  it("feature desabilitada não é concedida", () => {
    expect(hasFeature(entitlementsFor("ACTIVE"), "production.enabled")).toBe(false);
  });

  it("feature ausente equivale a desabilitada", () => {
    expect(hasFeature(entitlementsFor("ACTIVE"), "inexistente")).toBe(false);
  });

  it("limite é verificado antes da escrita", () => {
    const entitlements = entitlementsFor("ACTIVE");
    expect(isWithinLimit(entitlements, "products.max", 29)).toBe(true);
    expect(isWithinLimit(entitlements, "products.max", 30)).toBe(false);
  });

  it("limite nulo significa sem teto, não zero", () => {
    const entitlements = entitlementsFor("ACTIVE");
    expect(limitOf(entitlements, "stock.full")).toBeNull();
    expect(isWithinLimit(entitlements, "stock.full", 100_000)).toBe(true);
  });

  it("chave de limite inexistente não bloqueia", () => {
    expect(isWithinLimit(entitlementsFor("ACTIVE"), "nao.existe", 999)).toBe(true);
  });
});
