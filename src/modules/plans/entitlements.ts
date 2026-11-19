/**
 * Resolvedor único de permissões. Toda decisão de acesso a funcionalidade paga
 * passa por aqui — nunca por `if` espalhado na UI.
 *
 * Camadas independentes:
 *  - o PLANO define o teto (o que foi contratado);
 *  - o STATUS define o que está liberado agora (financeiro).
 */

export const SUBSCRIPTION_STATUSES = [
  "PENDING",
  "ACTIVE",
  "PAST_DUE",
  "RESTRICTED",
  "SUSPENDED",
  "CANCELLED",
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export type PlanSnapshot = {
  code: string;
  name: string;
  priceCents: number;
  activationFeeCents: number;
};

export type PlanFeatureRow = {
  featureKey: string;
  isEnabled: boolean;
  /** null = sem teto (quando `valueType` é UNLIMITED ou booleano). */
  limitValue: number | null;
};

export type AccessPolicy = {
  /** Painel operacional (produtos, estoque, produção). */
  canReadOperational: boolean;
  /** Escrita em módulo operacional. */
  canWriteOperational: boolean;
  /** Consulta e exportação dos dados do próprio estabelecimento. */
  canReadOwnData: boolean;
  canExportData: boolean;
  /** Área financeira e pagamento — sempre disponível, inclusive em atraso. */
  canAccessBilling: boolean;
  canPay: boolean;
};

export type Entitlements = {
  plan: PlanSnapshot;
  status: SubscriptionStatus;
  features: Record<string, boolean>;
  limits: Record<string, number | null>;
  access: AccessPolicy;
  /** Aviso que a UI deve exibir de forma persistente, se houver. */
  warning: string | null;
};

/**
 * Suspensão administrativa do estabelecimento prevalece sobre a assinatura:
 * o cliente perde o painel operacional, mas mantém dados, exportação e pagamento.
 */
export function effectiveSubscriptionStatus(
  tenantStatus: string,
  subscriptionStatus: SubscriptionStatus,
): SubscriptionStatus {
  if (tenantStatus === "SUSPENDED") return "SUSPENDED";
  if (tenantStatus === "CLOSED") return "CANCELLED";
  return subscriptionStatus;
}

/**
 * Política de travamento. Invariante central: **nenhum estado bloqueia leitura
 * ou exportação dos dados do cliente**.
 */
export function accessForStatus(status: SubscriptionStatus): AccessPolicy {
  switch (status) {
    case "ACTIVE":
    case "PAST_DUE":
      return {
        canReadOperational: true,
        canWriteOperational: true,
        canReadOwnData: true,
        canExportData: true,
        canAccessBilling: true,
        canPay: true,
      };

    case "PENDING":
      // Cadastro feito, primeiro pagamento ainda não confirmado.
      return {
        canReadOperational: false,
        canWriteOperational: false,
        canReadOwnData: true,
        canExportData: true,
        canAccessBilling: true,
        canPay: true,
      };

    case "RESTRICTED":
      // Escrita operacional bloqueada; leitura, exportação e pagamento liberados.
      return {
        canReadOperational: true,
        canWriteOperational: false,
        canReadOwnData: true,
        canExportData: true,
        canAccessBilling: true,
        canPay: true,
      };

    case "SUSPENDED":
      // Serviço operacional suspenso; dados e área financeira continuam acessíveis.
      return {
        canReadOperational: false,
        canWriteOperational: false,
        canReadOwnData: true,
        canExportData: true,
        canAccessBilling: true,
        canPay: true,
      };

    case "CANCELLED":
      return {
        canReadOperational: false,
        canWriteOperational: false,
        canReadOwnData: true,
        canExportData: true,
        canAccessBilling: true,
        canPay: false,
      };
  }
}

const WARNINGS: Partial<Record<SubscriptionStatus, string>> = {
  PENDING: "Ative sua assinatura para liberar o painel do estabelecimento.",
  PAST_DUE: "Existe uma cobrança em atraso. Regularize para evitar restrições.",
  RESTRICTED: "Edições operacionais estão suspensas por pendência financeira. Seus dados seguem disponíveis para consulta e exportação.",
  SUSPENDED: "Os serviços operacionais estão suspensos. Você mantém acesso aos seus dados e à área de pagamento.",
  CANCELLED: "Assinatura encerrada. Seus dados permanecem disponíveis para consulta e exportação.",
};

export function buildEntitlements(input: {
  plan: PlanSnapshot;
  planFeatures: ReadonlyArray<PlanFeatureRow>;
  status: SubscriptionStatus;
}): Entitlements {
  const features: Record<string, boolean> = {};
  const limits: Record<string, number | null> = {};

  for (const row of input.planFeatures) {
    features[row.featureKey] = row.isEnabled;
    limits[row.featureKey] = row.limitValue;
  }

  return {
    plan: input.plan,
    status: input.status,
    features,
    limits,
    access: accessForStatus(input.status),
    warning: WARNINGS[input.status] ?? null,
  };
}

/** Feature booleana; ausência de configuração equivale a desabilitada. */
export function hasFeature(entitlements: Entitlements, key: string): boolean {
  return entitlements.features[key] === true;
}

/**
 * Verificação de limite na escrita. `limit === null` significa sem teto —
 * nunca confundir com zero.
 */
export function isWithinLimit(
  entitlements: Entitlements,
  key: string,
  currentCount: number,
): boolean {
  const limit = entitlements.limits[key];
  if (limit === undefined || limit === null) return true;
  return currentCount < limit;
}

export function limitOf(entitlements: Entitlements, key: string): number | null {
  return entitlements.limits[key] ?? null;
}
