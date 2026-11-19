import { serverEnv } from "@/lib/env";

/**
 * Envio de e-mail transacional via API HTTP do Resend.
 *
 * Sem `RESEND_API_KEY`/`EMAIL_FROM` o envio lança `EmailNotConfiguredError` —
 * quem chama transforma isso em mensagem clara para o usuário. Nunca fingimos
 * que um e-mail saiu: link de redefinição que não chega é pior que um aviso.
 */

export class EmailNotConfiguredError extends Error {
  constructor() {
    super(
      "Envio de e-mail não configurado. Defina RESEND_API_KEY e EMAIL_FROM no ambiente.",
    );
    this.name = "EmailNotConfiguredError";
  }
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export async function sendEmail(input: SendEmailInput): Promise<void> {
  if (!isEmailConfigured()) throw new EmailNotConfiguredError();

  const env = serverEnv();
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Falha ao enviar e-mail (${response.status}): ${detail.slice(0, 200)}`);
  }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
