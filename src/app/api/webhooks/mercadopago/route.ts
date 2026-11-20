import { and, eq, lt, or } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { securityEvents, webhookEvents } from "@/db/schema";
import { serverEnv } from "@/lib/env";
import { constantTimeTokenEqual } from "@/modules/billing/rules";
import { processMercadoPagoEvent, type MercadoPagoNotification } from "@/modules/billing/webhook";
import crypto from "node:crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const eventSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    action: z.string().optional(),
    type: z.string().optional(),
    data: z.object({ id: z.union([z.string(), z.number()]).optional() }).optional(),
  })
  .passthrough();

function json(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, { status });
}

function verifySignature(
  xSignature: string,
  xRequestId: string,
  dataId: string,
  secret: string,
): boolean {
  if (!xSignature || !xRequestId || !dataId || !secret) return false;

  const parts = Object.fromEntries(
    xSignature.split(",").map((part) => {
      const [key, ...value] = part.trim().split("=");
      return [key, value.join("=")];
    }),
  );

  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  const manifest = `id:${dataId.toLowerCase()};request-id:${xRequestId};ts:${ts};`;
  const expected = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  if (expected.length !== v1.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}

export async function POST(request: Request): Promise<Response> {
  const env = serverEnv();
  const url = new URL(request.url);
  const queryDataId = url.searchParams.get("data.id") ?? url.searchParams.get("data_id") ?? "";

  const raw = await request.text();
  let parsedJson: unknown;
  try {
    parsedJson = raw ? JSON.parse(raw) : null;
  } catch {
    return json({ error: "Payload inválido." }, 400);
  }

  const parsed = eventSchema.safeParse(parsedJson);
  if (!parsed.success) return json({ error: "Evento inválido." }, 400);

  const body = parsed.data;
  const dataId = queryDataId || (body.data?.id != null ? String(body.data.id) : "");
  const eventId =
    body.id != null ? String(body.id) : dataId ? `${dataId}:${body.action ?? body.type ?? "event"}` : null;

  if (!eventId) return json({ error: "Evento sem identificador." }, 400);

  if (env.MP_WEBHOOK_SECRET) {
    const xSignature = request.headers.get("x-signature") ?? "";
    const xRequestId = request.headers.get("x-request-id") ?? "";
    if (!verifySignature(xSignature, xRequestId, dataId, env.MP_WEBHOOK_SECRET)) {
      await recordInvalidSignature(request);
      return json({ error: "Assinatura inválida." }, 401);
    }
  } else {
    return json({ error: "Webhook não configurado." }, 503);
  }

  const db = getDb();

  const [created] = await db
    .insert(webhookEvents)
    .values({
      gateway: "MERCADOPAGO",
      eventId,
      eventType: body.type ?? body.action ?? "payment",
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
      .where(and(eq(webhookEvents.gateway, "MERCADOPAGO"), eq(webhookEvents.eventId, eventId)))
      .limit(1);

    if (!existing || (existing.status !== "FAILED" && existing.status !== "RECEIVED")) {
      return json({ received: true, duplicate: true }, 200);
    }

    const [claimed] = await db
      .update(webhookEvents)
      .set({ status: "RECEIVED", lastError: null })
      .where(
        and(
          eq(webhookEvents.id, existing.id),
          or(
            eq(webhookEvents.status, "FAILED"),
            and(eq(webhookEvents.status, "RECEIVED"), lt(webhookEvents.receivedAt, new Date(Date.now() - 10 * 60 * 1000))),
          ),
        ),
      )
      .returning({ id: webhookEvents.id, attempts: webhookEvents.attempts });

    if (!claimed) return json({ received: true, duplicate: true }, 200);

    eventRowId = claimed.id;
    attempts = claimed.attempts + 1;
  }

  try {
    const result = await processMercadoPagoEvent(body as MercadoPagoNotification);
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
      detail: { endpoint: "/api/webhooks/mercadopago" },
    });
  } catch {
    // Segurança nunca deve derrubar o endpoint por falha de log.
  }
}