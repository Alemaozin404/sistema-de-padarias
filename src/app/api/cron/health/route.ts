import { sql } from "drizzle-orm";
import { serverEnv } from "@/lib/env";
import { getDb } from "@/lib/db";
import { systemHealthChecks } from "@/db/schema";
import { constantTimeTokenEqual } from "@/modules/billing/rules";
import { isGatewayConfigured } from "@/modules/billing/gateway";
import { isEmailConfigured } from "@/lib/email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Status = "UP" | "DEGRADED" | "DOWN";

async function checkDatabase(): Promise<{ status: Status; latencyMs: number; detail: string }> {
  const started = Date.now();
  try {
    await getDb().execute(sql`select 1`);
    return {
      status: "UP",
      latencyMs: Date.now() - started,
      detail: "Consulta de verificação concluída.",
    };
  } catch {
    return {
      status: "DOWN",
      latencyMs: Date.now() - started,
      detail: "Banco não respondeu à consulta de verificação.",
    };
  }
}

async function run(request: Request): Promise<Response> {
  const env = serverEnv();
  if (!env.CRON_SECRET) {
    return Response.json({ error: "Cron não configurado." }, { status: 503 });
  }

  const authorization = request.headers.get("authorization") ?? "";
  if (!constantTimeTokenEqual(authorization, `Bearer ${env.CRON_SECRET}`)) {
    return Response.json({ error: "Não autorizado." }, { status: 401 });
  }

  const database = await checkDatabase();
  const gateway = isGatewayConfigured();
  const email = isEmailConfigured();

  await getDb().insert(systemHealthChecks).values([
    {
      target: "DB",
      status: database.status,
      latencyMs: String(database.latencyMs),
      detail: database.detail,
    },
    {
      target: "GATEWAY",
      status: gateway ? "UP" : "DEGRADED",
      detail: gateway ? "Asaas configurado." : "ASAAS_API_KEY ausente; cobrança online indisponível.",
    },
    {
      target: "EMAIL",
      status: email ? "UP" : "DEGRADED",
      detail: email ? "Resend configurado." : "RESEND_API_KEY/EMAIL_FROM ausentes.",
    },
  ]);

  return Response.json({ ok: true, database, gateway, email });
}

export async function GET(request: Request): Promise<Response> {
  return run(request);
}

export async function POST(request: Request): Promise<Response> {
  return run(request);
}
