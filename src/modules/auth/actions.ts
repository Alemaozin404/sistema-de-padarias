"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAuth } from "@/lib/auth";
import { isEmailConfigured } from "@/lib/email";
import {
  clientIpFrom,
  consumeRateLimit,
  RATE_LIMIT_MESSAGE,
} from "@/lib/rate-limit";

export type LoginState = { error?: string };

const loginSchema = z.object({
  email: z.email().toLowerCase(),
  password: z.string().min(1),
});

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  // Mensagem genérica de propósito: não revela se o e-mail existe.
  if (!parsed.success) return { error: "E-mail ou senha inválidos." };

  const requestHeaders = await headers();
  const [byIp, byEmail] = await Promise.all([
    consumeRateLimit({
      scope: "login:ip",
      identifier: clientIpFrom(requestHeaders),
      limit: 20,
      windowSeconds: 900,
    }),
    consumeRateLimit({
      scope: "login:email",
      identifier: parsed.data.email,
      limit: 5,
      windowSeconds: 900,
    }),
  ]);
  if (!byIp.allowed || !byEmail.allowed) {
    return { error: RATE_LIMIT_MESSAGE };
  }

  try {
    await getAuth().api.signInEmail({ body: parsed.data });
  } catch {
    return { error: "E-mail ou senha inválidos." };
  }

  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await getAuth().api.signOut({ headers: await headers() });
  redirect("/login");
}

/* -------------------------------------------------------------------------- */
/* Redefinição de senha                                                       */
/* -------------------------------------------------------------------------- */

export type PasswordResetRequestState = { error?: string; success?: string };

const resetRequestSchema = z.object({ email: z.email().toLowerCase() });

export async function requestPasswordResetAction(
  _prev: PasswordResetRequestState,
  formData: FormData,
): Promise<PasswordResetRequestState> {
  if (!isEmailConfigured()) {
    return {
      error:
        "O envio de e-mail não está configurado nesta instalação, então o link de redefinição não pode ser entregue. Fale com o suporte do seu estabelecimento.",
    };
  }

  const parsed = resetRequestSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: "Informe um e-mail válido." };

  const requestHeaders = await headers();
  const [byEmail, byIp] = await Promise.all([
    consumeRateLimit({
      scope: "password-reset:email",
      identifier: parsed.data.email,
      limit: 3,
      windowSeconds: 3600,
    }),
    consumeRateLimit({
      scope: "password-reset:ip",
      identifier: clientIpFrom(requestHeaders),
      limit: 10,
      windowSeconds: 3600,
    }),
  ]);
  if (!byEmail.allowed || !byIp.allowed) {
    return { error: RATE_LIMIT_MESSAGE };
  }

  try {
    await getAuth().api.requestPasswordReset({
      body: { email: parsed.data.email, redirectTo: "/redefinir-senha" },
    });
  } catch {
    // Não revelamos existência de conta nem detalhe interno.
  }

  return {
    success:
      "Se existir uma conta com este e-mail, enviamos um link para criar uma nova senha. Verifique também a caixa de spam.",
  };
}

export type PasswordResetState = { error?: string; success?: string };

const resetSchema = z
  .object({
    token: z.string().min(10, "Link inválido ou expirado."),
    password: z.string().min(12, "Use ao menos 12 caracteres").max(128),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não conferem.",
  });

export async function resetPasswordAction(
  _prev: PasswordResetState,
  formData: FormData,
): Promise<PasswordResetState> {
  const parsed = resetSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Verifique os campos." };
  }

  try {
    await getAuth().api.resetPassword({
      body: { newPassword: parsed.data.password, token: parsed.data.token },
    });
  } catch {
    return {
      error:
        "Não foi possível redefinir a senha. O link pode ter expirado — solicite outro.",
    };
  }

  return { success: "Senha alterada. Você já pode entrar com a nova senha." };
}
