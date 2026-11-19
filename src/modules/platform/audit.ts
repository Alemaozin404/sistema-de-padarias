import { headers } from "next/headers";
import { withPlatformAdmin } from "@/lib/db";
import { auditLogs } from "@/db/schema";
import type { PlatformSession } from "@/lib/platform-auth";

/** Registra a ação administrativa com autor, antes/depois, IP e user agent. */
export async function auditPlatformAction(input: {
  session: PlatformSession;
  tenantId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = requestHeaders.get("user-agent")?.slice(0, 500) ?? null;

  await withPlatformAdmin(input.session.userId, (tx) =>
    tx.insert(auditLogs).values({
      tenantId: input.tenantId ?? null,
      actorType: "ADMIN",
      actorId: input.session.userId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      before: input.before ?? null,
      after: input.after ?? null,
      ip,
      userAgent,
    }),
  );
}
