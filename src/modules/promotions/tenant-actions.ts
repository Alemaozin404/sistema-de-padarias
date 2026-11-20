"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AuthError, requireTenant } from "@/lib/auth";
import { applyCoupon } from "./coupons";
import { redeemSecretKey } from "./secret-keys";

export type PromotionActionState = { error?: string; success?: string };

export async function redeemCouponAction(
  _prev: PromotionActionState,
  formData: FormData,
): Promise<PromotionActionState> {
  let membership;
  try {
    membership = await requireTenant(["OWNER", "MANAGER"]);
  } catch (error) {
    return { error: error instanceof AuthError ? "Sessão expirada." : "Acesso negado." };
  }

  const parsed = z.object({ code: z.string().min(3).max(40) }).safeParse({
    code: formData.get("code"),
  });
  if (!parsed.success) return { error: "Código inválido." };

  try {
    const result = await applyCoupon({
      tenantId: membership.tenantId,
      userId: membership.userId,
      code: parsed.data.code,
    });
    revalidatePath("/assinatura");
    return { success: result.message };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível aplicar o cupom." };
  }
}

export async function redeemSecretKeyAction(
  _prev: PromotionActionState,
  formData: FormData,
): Promise<PromotionActionState> {
  let membership;
  try {
    membership = await requireTenant(["OWNER", "MANAGER"]);
  } catch (error) {
    return { error: error instanceof AuthError ? "Sessão expirada." : "Acesso negado." };
  }

  const parsed = z.object({ code: z.string().min(8).max(64) }).safeParse({
    code: formData.get("code"),
  });
  if (!parsed.success) return { error: "Chave inválida." };

  try {
    const result = await redeemSecretKey({
      tenantId: membership.tenantId,
      userId: membership.userId,
      code: parsed.data.code,
    });
    revalidatePath("/assinatura");
    return { success: result.message };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível resgatar a chave." };
  }
}
