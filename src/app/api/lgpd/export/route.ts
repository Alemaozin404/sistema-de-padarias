import { headers } from "next/headers";
import { AuthError, requireTenant } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { auditLogs } from "@/db/schema";
import { clientIpFrom, consumeRateLimit, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";
import { collectTenantData, exportFilename, toCsv } from "@/modules/lgpd/export";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  let membership;
  try {
    membership = await requireTenant();
  } catch (error) {
    const status = error instanceof AuthError && error.code === "FORBIDDEN" ? 403 : 401;
    return Response.json({ error: "Não autenticado." }, { status });
  }

  const requestHeaders = await headers();
  const limit = await consumeRateLimit({
    scope: "lgpd-export",
    identifier: membership.userId,
    limit: 5,
    windowSeconds: 3600,
  });
  if (!limit.allowed) {
    return Response.json(
      { error: RATE_LIMIT_MESSAGE },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      },
    );
  }

  const format = new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "json";

  let data;
  try {
    data = await collectTenantData(membership.tenantId);
  } catch {
    return Response.json({ error: "Não foi possível exportar os dados." }, { status: 500 });
  }

  const userAgent = requestHeaders.get("user-agent")?.slice(0, 500) ?? null;
  const ip = clientIpFrom(requestHeaders);
  try {
    await withTenant(membership.tenantId, (tx) =>
      tx.insert(auditLogs).values({
        tenantId: membership.tenantId,
        actorType: "USER",
        actorId: membership.userId,
        action: "tenant.data_exported",
        entityType: "tenant",
        entityId: membership.tenantId,
        after: { format },
        ip,
        userAgent,
      }),
    );
  } catch {
    // A exportação não falha se a auditoria não puder ser gravada, mas o evento
    // deixa de existir na trilha — logado para investigação.
    console.error("Falha ao registrar exportação LGPD em audit_logs");
  }

  const filename = exportFilename(data.tenant.slug as string, format);
  const body = format === "csv" ? toCsv(data) : JSON.stringify(data, null, 2);
  const contentType = format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8";

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
