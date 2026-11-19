import { and, eq, lt, or } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { securityEvents, webhookEvents } from "@/db/schema";
import { serverEnv } from "@/lib/env";
import { constantTimeTokenEqual } from "@/modules/billing/rules";
import { processAsaasEvent, type AsaasEvent } from "@/modules/billing/webhook";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const eventSchema = z
  .object({
    id: z.string().min(1),
    event: z.string().min(1),
    payment: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

function json(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, { status });
}

/**
 * Webhook Asaas.
 *
 * Contrato:
 *  - token no header `asaas-access-token`, comparado em tempo constante;
 *  - `id` do evento é a chave de idempotência (`UNIQUE (gateway, event_id)`);
 *  - reenvio de evento já processado responde 200 sem repetir efeito;
 *  - evento com falha fica FAILED e o próximo reenvio tenta de novo;
 *  - falha responde 5xx para o gateway reenviar.
 */
export async function POST(request: Request): Promise<Response> {
  const env = serverEnv();
  if (!env.ASAAS_WEBHOOK_TOKEN) {
    return json({ error: "Webhook não configurado." }, 503);
  }

  const provided = request.headers.get("asaas-access-token") ?? "";
  if (!constantTimeTokenEqual(provided, env.ASAAS_WEBHOOK_TOKEN)) {
    await recordInvalidSignature(request);
    return json({ error: "Token inválido." }, 401);
  }

  const raw = await request.text();
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return json({ error: "Payload inválido." }, 400);
  }

  const parsed = eventSchema.safeParse(parsedJson);
  if (!parsed.success) return json({ error: "Evento inválido." }, 400);

  const body = parsed.data;
  const db = getDb();

  const [created] = await db
    .insert(webhookEvents)
    .values({
      gateway: "ASAAS",
      eventId: body.id,
      eventType: body.event,
      payload: body as never,
      status: "RECEIVED",
    })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });

  let eventRowId = created?.id;
  let attempts = 1;

  if (!eventRowId) {
    const [existing] = await db
      .select({ id: webhookEvents.id, status: webhookEvents.status })
      .from(webhookEvents)
      .where(
        and(eq(webhookEvents.gateway, "ASAAS"), eq(webhookEvents.eventId, body.id)),
      )
      .limit(1);

    if (!existing || (existing.status !== "FAILED" && existing.status !== "RECEIVED")) {
      return json({ received: true, duplicate: true }, 200);
    }

    // Retentativa de evento FAILED ou de RECEIVED travado (processo caiu no meio).
    // RECEIVED só é reivindicado depois de 10 minutos, para não atropelar uma
    // entrega concorrente que ainda está processando.
    const [claimed] = await db
      .update(webhookEvents)
      .set({ status: "RECEIVED", lastError: null })
      .where(
        and(
          eq(webhookEvents.id, existing.id),
          or(
            eq(webhookEvents.status, "FAILED"),
            and(
              eq(webhookEvents.status, "RECEIVED"),
              lt(webhookEvents.receivedAt, new Date(Date.now() - 10 * 60 * 1000)),
            ),
          ),
        ),
      )
      .returning({ id: webhookEvents.id, attempts: webhookEvents.attempts });

    if (!claimed) return json({ received: true, duplicate: true }, 200);

    eventRowId = claimed.id;
    attempts = claimed.attempts + 1;
  }

  try {
    const result = await processAsaasEvent(body as AsaasEvent);
    await db
      .update(webhookEvents)
      .set({
        status: result,
        attempts,
        processedAt: new Date(),
        lastError: null,
      })
      .where(eq(webhookEvents.id, eventRowId));

    return json({ received: true, result }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Erro desconhecido";
    await db
      .update(webhookEvents)
      .set({ status: "FAILED", attempts, lastError: message })
      .where(eq(webhookEvents.id, eventRowId));

    // Não devolvemos o detalhe ao gateway; ele fica no evento para diagnóstico.
    return json({ error: "Falha ao processar evento." }, 500);
  }
}

async function recordInvalidSignature(request: Request): Promise<void> {
  try {
    await getDb().insert(securityEvents).values({
      type: "SIGNATURE_INVALID",
      severity: "WARNING",
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: request.headers.get("user-agent"),
      detail: { endpoint: "/api/webhooks/asaas" },
    });
  } catch {
    // Segurança nunca deve derrubar o endpoint por falha de log.
  }
}
