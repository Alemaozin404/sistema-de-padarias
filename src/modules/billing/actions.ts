"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AuthError, requireTenant } from "@/lib/auth";
import { requireRecentPlatformAdmin } from "@/lib/platform-auth";
import { GatewayError, GatewayNotConfiguredError, isGatewayConfigured } from "./gateway";
import {
  BillingError,
  cancelInvoice,
  ensureChargeForInvoice,
  getInvoice,
  processCardPayment,
  reconcileInvoice,
  registerManualPayment,
  startCheckout,
} from "./service";

export type BillingActionState = { error?: string; success?: string };

function messageForError(error: unknown): string {
  if (error instanceof BillingError || error instanceof GatewayNotConfiguredError) {
    return error.message;
  }
  if (error instanceof GatewayError) {
    return error.message;
  }
  if (error instanceof AuthError) {
    return error.code === "FORBIDDEN"
      ? "Apenas o proprietário ou gerente pode cuidar da assinatura."
      : "Sua sessão expirou. Entre novamente.";
  }
  return "Não foi possível concluir a operação de cobrança. Tente novamente.";
}

function refresh(): void {
  revalidatePath("/assinatura");
  revalidatePath("/dashboard");
}

/** Gera a primeira cobrança (ou retoma a existente) e devolve o Pix. */
export async function startCheckoutAction(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  let membership;
  try {
    membership = await requireTenant(["OWNER", "MANAGER"]);
  } catch (error) {
    return { error: messageForError(error) };
  }

  if (!isGatewayConfigured()) {
    return {
      error:
        "Pagamento online não configurado neste ambiente. Peça ao suporte para configurar MP_ACCESS_TOKEN.",
    };
  }

  const document = String(formData.get("document") ?? "").trim();

  try {
    await startCheckout({
      tenantId: membership.tenantId,
      actorId: membership.userId,
      document: document || null,
    });
    refresh();
    return { success: "Cobrança Pix gerada. Pague pelo código ou pelo link abaixo." };
  } catch (error) {
    return { error: messageForError(error) };
  }
}

/** Cria a cobrança de uma fatura que ficou sem gateway (ex.: renovação do cron). */
export async function createChargeAction(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  let membership;
  try {
    membership = await requireTenant(["OWNER", "MANAGER"]);
  } catch (error) {
    return { error: messageForError(error) };
  }

  if (!isGatewayConfigured()) {
    return {
      error:
        "Pagamento online não configurado neste ambiente. Peça ao suporte para configurar MP_ACCESS_TOKEN.",
    };
  }

  const parsed = z.object({ invoiceId: z.uuid() }).safeParse({
    invoiceId: formData.get("invoiceId"),
  });
  if (!parsed.success) return { error: "Fatura inválida." };

  try {
    await ensureChargeForInvoice({
      tenantId: membership.tenantId,
      invoiceId: parsed.data.invoiceId,
      actorId: membership.userId,
      document: String(formData.get("document") ?? "").trim() || null,
    });
    refresh();
    return { success: "Cobrança gerada." };
  } catch (error) {
    return { error: messageForError(error) };
  }
}

/** Segunda fonte de verdade: pergunta ao gateway se a fatura foi paga. */
export async function reconcileInvoiceAction(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  let membership;
  try {
    membership = await requireTenant(["OWNER", "MANAGER"]);
  } catch (error) {
    return { error: messageForError(error) };
  }

  if (!isGatewayConfigured()) {
    return { error: "Pagamento online não configurado neste ambiente." };
  }

  const parsed = z.object({ invoiceId: z.uuid() }).safeParse({
    invoiceId: formData.get("invoiceId"),
  });
  if (!parsed.success) return { error: "Fatura inválida." };

  try {
    const result = await reconcileInvoice({
      tenantId: membership.tenantId,
      invoiceId: parsed.data.invoiceId,
    });
    refresh();

    if (result.status === "PAID") {
      return { success: "Pagamento confirmado. Assinatura ativa." };
    }
    if (result.status === "OVERDUE") {
      return { success: "O gateway informa que esta cobrança está vencida." };
    }
    return { success: "O gateway ainda não confirmou este pagamento." };
  } catch (error) {
    return { error: messageForError(error) };
  }
}

/** Cancela (anula) uma cobrança em aberto. */
export async function cancelChargeAction(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  let membership;
  try {
    membership = await requireTenant(["OWNER", "MANAGER"]);
  } catch (error) {
    return { error: messageForError(error) };
  }

  const parsed = z.object({ invoiceId: z.uuid() }).safeParse({
    invoiceId: formData.get("invoiceId"),
  });
  if (!parsed.success) return { error: "Fatura inválida." };

  try {
    await cancelInvoice({
      tenantId: membership.tenantId,
      invoiceId: parsed.data.invoiceId,
      actorId: membership.userId,
      reason: String(formData.get("reason") ?? "").trim() || null,
    });
    refresh();
    return { success: "Cobrança cancelada." };
  } catch (error) {
    return { error: messageForError(error) };
  }
}

export const cancelInvoiceAction = cancelChargeAction;
export const voidInvoiceAction = cancelChargeAction;

const manualPaymentSchema = z.object({
  tenantId: z.uuid(),
  invoiceId: z.uuid(),
  method: z.enum(["PIX", "CARD", "BOLETO"]),
  note: z.string().trim().max(500).optional(),
});

/**
 * Pagamento manual registrado pelo admin da plataforma (Pix recebido fora do
 * gateway, transferência etc.). Sem tela nesta fase: o painel global é a Fase 08.
 * O valor nunca vem do formulário — é o total da fatura.
 */
export async function registerManualPaymentAction(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  let admin;
  try {
    admin = await requireRecentPlatformAdmin();
    if (admin.role !== "OWNER") {
      return { error: "Apenas o proprietário pode registrar pagamento manual." };
    }
  } catch (error) {
    return { error: messageForError(error) };
  }

  const parsed = manualPaymentSchema.safeParse({
    tenantId: formData.get("tenantId"),
    invoiceId: formData.get("invoiceId"),
    method: formData.get("method"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { error: "Dados do pagamento inválidos." };

  const invoice = await getInvoice(parsed.data.tenantId, parsed.data.invoiceId);
  if (!invoice) return { error: "Fatura não encontrada para este estabelecimento." };
  if (invoice.status === "PAID") return { error: "Esta fatura já está paga." };
  if (invoice.status === "VOID" || invoice.status === "REFUNDED") {
    return { error: "Esta fatura não pode receber pagamento." };
  }

  try {
    await registerManualPayment({
      tenantId: parsed.data.tenantId,
      invoiceId: invoice.id,
      amountCents: invoice.totalCents,
      method: parsed.data.method,
      actorId: admin.userId,
      note: parsed.data.note ?? null,
    });
    refresh();
    return { success: "Pagamento manual registrado e assinatura atualizada." };
  } catch (error) {
    return { error: messageForError(error) };
  }
}

const cardPaymentSchema = z.object({
  invoiceId: z.uuid(),
  token: z.string().min(1),
  installments: z.coerce.number().int().min(1).max(24),
  paymentMethodId: z.string().min(1),
  issuerId: z.string().optional(),
  payerEmail: z.email(),
  payerDocument: z.string().optional(),
});

/** Pagamento com cartão via token do Payment Brick. */
export async function submitCardPaymentAction(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  let membership;
  try {
    membership = await requireTenant(["OWNER", "MANAGER"]);
  } catch (error) {
    return { error: messageForError(error) };
  }

  if (!isGatewayConfigured()) {
    return { error: "Pagamento online não configurado neste ambiente." };
  }

  const parsed = cardPaymentSchema.safeParse({
    invoiceId: formData.get("invoiceId"),
    token: formData.get("token"),
    installments: formData.get("installments") ?? 1,
    paymentMethodId: formData.get("paymentMethodId"),
    issuerId: formData.get("issuerId") || undefined,
    payerEmail: formData.get("payerEmail"),
    payerDocument: formData.get("payerDocument") || undefined,
  });
  if (!parsed.success) return { error: "Dados do pagamento inválidos." };

  try {
    const result = await processCardPayment({
      tenantId: membership.tenantId,
      invoiceId: parsed.data.invoiceId,
      actorId: membership.userId,
      token: parsed.data.token,
      installments: parsed.data.installments,
      paymentMethodId: parsed.data.paymentMethodId,
      issuerId: parsed.data.issuerId ?? null,
      payerEmail: parsed.data.payerEmail,
      payerDocument: parsed.data.payerDocument ?? null,
    });
    refresh();
    if (result.status === "approved") {
      return { success: "Pagamento aprovado. Assinatura ativa." };
    }
    if (result.status === "in_process" || result.status === "pending") {
      return { success: "Pagamento em processamento. Aguarde a confirmação." };
    }
    return { error: "Pagamento não aprovado. Tente novamente." };
  } catch (error) {
    return { error: messageForError(error) };
  }
}
