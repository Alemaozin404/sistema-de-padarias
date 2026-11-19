import { serverEnv } from "@/lib/env";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const env = serverEnv();
  return NextResponse.json({
    asaasApiKey: Boolean(process.env.ASAAS_API_KEY),
    asaasApiKeyB64: Boolean(process.env.ASAAS_API_KEY_B64),
    asaasWebhookToken: Boolean(process.env.ASAAS_WEBHOOK_TOKEN),
    asaasBaseUrl: env.ASAAS_BASE_URL ?? null,
    resend: Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
    r2: Boolean(process.env.R2_ACCOUNT_ID),
    upstash: Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
  });
}
