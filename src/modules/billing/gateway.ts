import { serverEnv } from "@/lib/env";
import { formatCentsInput } from "./rules";

/**
 * Cliente mínimo da API Asaas (v3) via HTTP. Sem SDK: são cinco chamadas e o
 * formato é documentado, então uma dependência extra só aumentaria a superfície.
 *
 * Nenhum segredo sai daqui. Erros do gateway são convertidos em mensagens curtas:
 * corpo de resposta pode conter dados do cliente e não deve ir para a tela.
 */

export class GatewayNotConfiguredError extends Error {
  constructor() {
    super(
      "Pagamento online não configurado. Defina ASAAS_API_KEY e ASAAS_WEBHOOK_TOKEN para gerar cobranças.",
    );
    this.name = "GatewayNotConfiguredError";
  }
}

export class GatewayError extends Error {
  constructor(
    message: string,
    public readonly status: number | null = null,
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

export type AsaasCustomer = {
  id: string;
  name?: string;
  cpfCnpj?: string;
};

export type AsaasPayment = {
  id: string;
  customer: string;
  value: number;
  netValue?: number;
  billingType?: string;
  status: string;
  dueDate?: string;
  paymentDate?: string | null;
  confirmedDate?: string | null;
  clientPaymentDate?: string | null;
  invoiceUrl?: string | null;
  externalReference?: string | null;
};

export type AsaasPixQrCode = {
  payload: string;
  expirationDate?: string | null;
};

type AsaasErrorBody = {
  errors?: Array<{ code?: string; description?: string }>;
};

export function isGatewayConfigured(): boolean {
  return Boolean(process.env.ASAAS_API_KEY && process.env.ASAAS_WEBHOOK_TOKEN);
}

function baseUrl(): string {
  const env = serverEnv();
  return (env.ASAAS_BASE_URL ?? "https://api-sandbox.asaas.com/v3").replace(/\/$/, "");
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const env = serverEnv();
  if (!env.ASAAS_API_KEY) throw new GatewayNotConfiguredError();

  let response: Response;
  try {
    response = await fetch(`${baseUrl()}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        access_token: env.ASAAS_API_KEY,
        "User-Agent": "plataforma-padarias/0.1",
        ...init.headers,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new GatewayError("Não foi possível falar com o gateway de pagamento. Tente novamente.");
  }

  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  if (!response.ok) {
    const detail = (body as AsaasErrorBody | null)?.errors?.[0]?.description;
    throw new GatewayError(
      detail
        ? `Gateway recusou a cobrança: ${detail}`
        : `Gateway recusou a cobrança (HTTP ${response.status}).`,
      response.status,
    );
  }

  return body as T;
}

export async function findCustomerByDocument(document: string): Promise<AsaasCustomer | null> {
  const response = await request<{ data?: AsaasCustomer[] }>(
    `/customers?cpfCnpj=${encodeURIComponent(document)}&limit=1`,
  );
  return response.data?.[0] ?? null;
}

export async function createCustomer(input: {
  name: string;
  document: string;
  email?: string | null;
  mobilePhone?: string | null;
  externalReference: string;
}): Promise<AsaasCustomer> {
  return request<AsaasCustomer>("/customers", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      cpfCnpj: input.document,
      email: input.email || undefined,
      mobilePhone: input.mobilePhone || undefined,
      externalReference: input.externalReference,
      notificationDisabled: false,
    }),
  });
}

export async function createPixPayment(input: {
  customerId: string;
  valueCents: number;
  dueDate: string;
  description: string;
  externalReference: string;
}): Promise<AsaasPayment> {
  return request<AsaasPayment>("/payments", {
    method: "POST",
    body: JSON.stringify({
      customer: input.customerId,
      billingType: "PIX",
      value: formatCentsInput(input.valueCents),
      dueDate: input.dueDate,
      description: input.description,
      externalReference: input.externalReference,
    }),
  });
}

export async function findPaymentByExternalReference(
  externalReference: string,
): Promise<AsaasPayment | null> {
  const response = await request<{ data?: AsaasPayment[] }>(
    `/payments?externalReference=${encodeURIComponent(externalReference)}&limit=1`,
  );
  return response.data?.[0] ?? null;
}

export async function getPayment(paymentId: string): Promise<AsaasPayment> {
  return request<AsaasPayment>(`/payments/${encodeURIComponent(paymentId)}`);
}

export async function getPixQrCode(paymentId: string): Promise<AsaasPixQrCode> {
  return request<AsaasPixQrCode>(
    `/payments/${encodeURIComponent(paymentId)}/pixQrCode`,
  );
}
