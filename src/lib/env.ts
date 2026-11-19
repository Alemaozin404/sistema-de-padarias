import { z } from "zod";

/**
 * Validação de ambiente. Deliberadamente preguiçosa: o build não deve depender
 * de segredos de produção, mas o primeiro acesso em runtime falha com mensagem
 * clara se algo estiver faltando (nunca com `undefined` silencioso).
 *
 * Nenhum módulo lê `process.env` diretamente — tudo passa por aqui.
 */

const serverSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatória"),
  DATABASE_URL_UNPOOLED: z.string().min(1).optional(),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET deve ter ao menos 32 caracteres"),
  BETTER_AUTH_URL: z.url(),

  // Gateway: opcional até a Fase 06 estar ativa.
  ASAAS_API_KEY: z.string().min(1).optional(),
  ASAAS_WEBHOOK_TOKEN: z.string().min(1).optional(),
  ASAAS_BASE_URL: z.url().optional(),

  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(1).optional(),

  R2_ACCOUNT_ID: z.string().min(1).optional(),
  R2_ACCESS_KEY_ID: z.string().min(1).optional(),
  R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  R2_BUCKET: z.string().min(1).optional(),

  UPSTASH_REDIS_REST_URL: z.url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),

  CRON_SECRET: z.string().min(16).optional(),
  SENTRY_DSN: z.string().min(1).optional(),
});

const publicSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  NEXT_PUBLIC_WHATSAPP_SUPPORT: z.string().default(""),
});

export type ServerEnv = z.infer<typeof serverSchema>;
export type PublicEnv = z.infer<typeof publicSchema>;

let cached: ServerEnv | null = null;

/** Ambiente do servidor. Lança erro descritivo na primeira chamada inválida. */
export function serverEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Configuração de ambiente inválida:\n${issues}\nVerifique .env.example.`);
  }

  cached = parsed.data;
  return cached;
}

/**
 * Variáveis públicas (embutidas no bundle). Acessadas por nome literal para o
 * Next conseguir substituí-las no build.
 */
export const publicEnv: PublicEnv = publicSchema.parse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_WHATSAPP_SUPPORT: process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT,
});

export const isDatabaseConfigured = (): boolean => Boolean(process.env.DATABASE_URL);

/**
 * Configuração opcional do rate limit distribuído. Lida fora de `serverEnv()`
 * para que o fallback em memória continue funcionando em instalações sem Redis
 * e em testes que não carregam o ambiente completo.
 */
export function upstashConfig(): { url?: string; token?: string } {
  return {
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  };
}
