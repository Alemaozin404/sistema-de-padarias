"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  clientIpFrom,
  consumeRateLimit,
  RATE_LIMIT_MESSAGE,
} from "@/lib/rate-limit";
import { user } from "@/db/schema";
import {
  createPlatformSession,
  destroyPlatformSession,
  getPlatformSession,
  verifyPlatformCredentials,
} from "@/lib/platform-auth";
import { ensureTotpSecret, completeTotp, reauthenticate } from "./auth-service";
import { eq } from "drizzle-orm";

export type PlatformLoginState = { error?: string };

const loginSchema = z.object({
  email: z.email().toLowerCase(),
  password: z.string().min(1).max(128),
});

export async function platformLoginAction(
  _prev: PlatformLoginState,
  formData: FormData,
): Promise<PlatformLoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "E-mail ou senha inválidos." };

  const requestHeaders = await headers();
  const [byIp, byEmail] = await Promise.all([
    consumeRateLimit({
      scope: "platform-login:ip",
      identifier: clientIpFrom(requestHeaders),
      limit: 20,
      windowSeconds: 900,
    }),
    consumeRateLimit({
      scope: "platform-login:email",
      identifier: parsed.data.email,
      limit: 5,
      windowSeconds: 900,
    }),
  ]);
  if (!byIp.allowed || !byEmail.allowed) {
    return { error: RATE_LIMIT_MESSAGE };
  }

  const admin = await verifyPlatformCredentials(parsed.data.email, parsed.data.password);
  if (!admin) return { error: "E-mail ou senha inválidos." };

  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = requestHeaders.get("user-agent")?.slice(0, 500) ?? null;

  await createPlatformSession({ userId: admin.userId, ip, userAgent });
  await getDb().update(user).set({ lastLoginAt: new Date() }).where(eq(user.id, admin.userId));

  const session = await getPlatformSession();
  if (session) {
    // Se ainda não existe segredo, a página de 2FA mostra a chave de cadastro.
    await ensureTotpSecret(session.userId, session.totpSecret);
  }

  redirect("/admin/2fa");
}

export type PlatformTotpState = { error?: string };

export async function platformTotpAction(
  _prev: PlatformTotpState,
  formData: FormData,
): Promise<PlatformTotpState> {
  const session = await getPlatformSession();
  if (!session) redirect("/admin/login");

  const limit = await consumeRateLimit({
    scope: "platform-2fa",
    identifier: session.userId,
    limit: 8,
    windowSeconds: 600,
  });
  if (!limit.allowed) return { error: RATE_LIMIT_MESSAGE };

  const token = String(formData.get("code") ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(token)) return { error: "Informe o código de 6 dígitos." };

  const result = await completeTotp(session, token);
  if (result === "REPLAY") return { error: "Este código já foi usado. Aguarde o próximo." };
  if (result !== "OK") return { error: "Código inválido. Confira o relógio e tente novamente." };

  redirect("/admin");
}

export async function platformLogoutAction(): Promise<void> {
  await destroyPlatformSession();
  redirect("/admin/login");
}

export type ReauthState = { error?: string; success?: string };

export async function platformReauthAction(
  _prev: ReauthState,
  formData: FormData,
): Promise<ReauthState> {
  const session = await getPlatformSession();
  if (!session) redirect("/admin/login");

  const password = String(formData.get("password") ?? "");
  if (password.length < 1) return { error: "Informe sua senha." };

  const limit = await consumeRateLimit({
    scope: "platform-reauth",
    identifier: session.userId,
    limit: 5,
    windowSeconds: 600,
  });
  if (!limit.allowed) return { error: RATE_LIMIT_MESSAGE };

  const ok = await reauthenticate(session, password);
  if (!ok) return { error: "Senha incorreta." };

  revalidatePath("/admin");
  return { success: "Reautenticado por 10 minutos." };
}
