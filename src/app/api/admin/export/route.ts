import { NextResponse } from "next/server";
import { getPlatformSession } from "@/lib/platform-auth";
import {
  listPlatformUsers,
  listPlatformSubscriptions,
  listAuditLogs,
  getPlatformOverview,
} from "@/modules/platform/queries";
import { withPlatformAdmin } from "@/lib/db";

export const dynamic = "force-dynamic";

function csv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]!);
  const escape = (value: unknown) => {
    const text = value === null || value === undefined ? "" : String(value);
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };
  return [headers.join(","), ...rows.map((row) => headers.map((header) => escape(row[header])).join(","))].join("\n");
}

export async function GET(request: Request) {
  const session = await getPlatformSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind") ?? "users";

  if (kind === "users") {
    const users = await listPlatformUsers();
    const rows = users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      status: user.status,
      memberships: user.memberships.map((membership) => membership.tradeName).join("; "),
      activeSessions: user.activeSessions,
      createdAt: user.createdAt.toISOString(),
    }));
    return new NextResponse(csv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="usuarios.csv"',
      },
    });
  }

  if (kind === "tenants") {
    const overview = await getPlatformOverview();
    const rows = overview.clients.map((client) => ({
      tenantId: client.tenantId,
      tradeName: client.tradeName,
      slug: client.slug,
      tenantStatus: client.tenantStatus,
      plan: client.planName ?? "",
      subscriptionStatus: client.subscriptionStatus ?? "",
      priceCents: client.priceCents,
      nextDueDate: client.nextDueDate ?? "",
      overdueCents: client.overdueCents,
    }));
    return new NextResponse(csv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="padarias.csv"',
      },
    });
  }

  if (kind === "subscriptions") {
    const rowsData = await listPlatformSubscriptions();
    const rows = rowsData.map((row) => ({
      tenant: row.tenant.tradeName,
      plan: row.plan.name,
      status: row.subscription.status,
      priceCents: row.subscription.priceCents,
      nextDueDate: row.subscription.nextDueDate ?? "",
      createdAt: row.subscription.createdAt.toISOString(),
    }));
    return new NextResponse(csv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="assinaturas.csv"',
      },
    });
  }

  if (kind === "audit") {
    const logs = await withPlatformAdmin(session.userId, (tx) => listAuditLogs(tx, { limit: 500 }));
    const rows = logs.map((log) => ({
      id: log.id,
      createdAt: log.createdAt.toISOString(),
      actorType: log.actorType,
      actorId: log.actorId ?? "",
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId ?? "",
      tenantId: log.tenantId ?? "",
    }));
    return new NextResponse(csv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="auditoria.csv"',
      },
    });
  }

  return NextResponse.json({ error: "invalid kind" }, { status: 400 });
}
