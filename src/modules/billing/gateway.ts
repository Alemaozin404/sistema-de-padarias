import { serverEnv } from "@/lib/env";
import { formatCentsInput } from "./rules";

/**
 * Cliente mínimo da API Mercado Pago via HTTP. Mantemos a superfície pequena:
 * cinco chamadas, sem SDK no servidor. Segredos nunca saem daqui.
 */

export class GatewayNotConfiguredError extends Error {
  constructor() {
    super(
      "Pagamento online não configurado. Defina MP_ACCESS_TOKEN para gerar cobranças.",
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

export type MercadoPagoCustomer = {
  id: string;
  email?: string;
};

export type MercadoPagoPayment = {
  id: string;
  status: string;
  status_detail?: string;
  transaction_amount?: number;
  payment_method_id?: string;
  payment_type_id?: string;
  external_reference?: string | null;
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
      ticket_url?: string;
    };
  };
  ticket_url?: string | null;
  date_approved?: string | null;
  date_created?: string | null;
};

export type MercadoPagoPixQrCode = {
  payload: string;
  base64?: string | null;
  expirationDate?: string | null;
};

function accessToken(): string | undefined {
  return process.env.MP_ACCESS_TOKEN?.trim();
}

export function isGatewayConfigured(): boolean {
  const token = accessToken();
  if (!token) return false;
  // Tokens reais do Mercado Pago começam com TEST- (sandbox) ou APP_USR- (produção).
  // Placeholders como "[SENSITIVE]" não devem ser considerados configurados.
  return token.startsWith("TEST-") || token.startsWith("APP_USR-");
}

function baseUrl(): string {
  return "https://api.mercadopago.com";
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = accessToken();
  if (!token) throw new GatewayNotConfiguredError();

  let response: Response;
  try {
    response = await fetch(`${baseUrl()}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "plataforma-padarias/0.1",
        ...init.headers,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
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
    const detail =
      (body as { message?: string; error?: string } | null)?.message ??
      (body as { message?: string; error?: string } | null)?.error;
    throw new GatewayError(
      detail
        ? `Gateway recusou a cobrança: ${detail}`
        : `Gateway recusou a cobrança (HTTP ${response.status}).`,
      response.status,
    );
  }

  return body as T;
}

export async function findCustomerByDocument(document: string): Promise<MercadoPagoCustomer | null> {
  try {
    const response = await request<{ results?: MercadoPagoCustomer[] }>(
      `/v1/customers/search?identification.number=${encodeURIComponent(document)}&limit=1`,
    );
    return response.results?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function createCustomer(input: {
  name: string;
  document: string;
  email?: string | null;
  mobilePhone?: string | null;
  externalReference: string;
}): Promise<MercadoPagoCustomer> {
  return request<MercadoPagoCustomer>("/v1/customers", {
    method: "POST",
    body: JSON.stringify({
      email: input.email || undefined,
      first_name: input.name,
      identification: {
        type: input.document.length === 11 ? "CPF" : "CNPJ",
        number: input.document,
      },
      external_reference: input.externalReference,
      phone: input.mobilePhone ? { number: input.mobilePhone } : undefined,
    }),
  });
}

export async function createPixPayment(input: {
  customerId?: string | null;
  valueCents: number;
  description: string;
  externalReference: string;
  payerEmail: string;
  payerDocument?: string | null;
}): Promise<MercadoPagoPayment> {
  return request<MercadoPagoPayment>("/v1/payments", {
    method: "POST",
    headers: { "X-Idempotency-Key": input.externalReference },
    body: JSON.stringify({
      transaction_amount: formatCentsInput(input.valueCents),
      description: input.description,
      payment_method_id: "pix",
      external_reference: input.externalReference,
      notification_url: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/webhooks/mercadopago`,
      payer: {
        email: input.payerEmail,
        identification: input.payerDocument
          ? {
              type: input.payerDocument.length === 11 ? "CPF" : "CNPJ",
              number: input.payerDocument,
            }
          : undefined,
      },
    }),
  });
}

export async function createCardPayment(input: {
  token: string;
  valueCents: number;
  installments: number;
  paymentMethodId: string;
  issuerId?: string | null;
  description: string;
  externalReference: string;
  payerEmail: string;
  payerDocument?: string | null;
}): Promise<MercadoPagoPayment> {
  return request<MercadoPagoPayment>("/v1/payments", {
    method: "POST",
    headers: { "X-Idempotency-Key": input.externalReference },
    body: JSON.stringify({
      transaction_amount: formatCentsInput(input.valueCents),
      token: input.token,
      description: input.description,
      installments: input.installments,
      payment_method_id: input.paymentMethodId,
      issuer_id:
        input.issuerId && /^\d+$/.test(input.issuerId)
          ? Number(input.issuerId)
          : undefined,
      external_reference: input.externalReference,
      notification_url: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/webhooks/mercadopago`,
      payer: {
        email: input.payerEmail,
        identification: input.payerDocument
          ? {
              type: input.payerDocument.length === 11 ? "CPF" : "CNPJ",
              number: input.payerDocument,
            }
          : undefined,
      },
    }),
  });
}

export async function findPaymentByExternalReference(
  externalReference: string,
): Promise<MercadoPagoPayment | null> {
  try {
    const response = await request<{ results?: MercadoPagoPayment[] }>(
      `/v1/payments/search?external_reference=${encodeURIComponent(externalReference)}&limit=1`,
    );
    return response.results?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function getPayment(paymentId: string): Promise<MercadoPagoPayment> {
  return request<MercadoPagoPayment>(`/v1/payments/${encodeURIComponent(paymentId)}`);
}

export async function cancelPayment(paymentId: string): Promise<MercadoPagoPayment | null> {
  try {
    return await request<MercadoPagoPayment>(`/v1/payments/${encodeURIComponent(paymentId)}`, {
      method: "PUT",
      body: JSON.stringify({ status: "cancelled" }),
    });
  } catch {
    return null;
  }
}

export async function getPixQrCode(paymentId: string): Promise<MercadoPagoPixQrCode> {
  const payment = await getPayment(paymentId);
  const qr = payment.point_of_interaction?.transaction_data;
  return {
    payload: qr?.qr_code ?? "",
    base64: qr?.qr_code_base64 ?? null,
    expirationDate: null,
  };
}