import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { withInviteToken, withTenant } from "@/lib/db";
import { invitations, memberships, tenants, user } from "@/db/schema";
import { hashInvitationToken } from "./token";

export type MemberRow = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: "OWNER" | "MANAGER" | "STAFF";
  status: string;
  acceptedAt: Date | null;
};

export async function listMembers(tenantId: string): Promise<MemberRow[]> {
  const rows = await withTenant(tenantId, (tx) =>
    tx
      .select({
        id: memberships.id,
        userId: memberships.userId,
        name: user.name,
        email: user.email,
        role: memberships.role,
        status: memberships.status,
        acceptedAt: memberships.acceptedAt,
      })
      .from(memberships)
      .innerJoin(user, eq(user.id, memberships.userId))
      .where(eq(memberships.tenantId, tenantId))
      .orderBy(asc(memberships.createdAt)),
  );

  return rows.map((row) => ({ ...row, role: row.role as MemberRow["role"] }));
}

export async function listPendingInvitations(tenantId: string) {
  return withTenant(tenantId, (tx) =>
    tx
      .select({
        id: invitations.id,
        email: invitations.email,
        role: invitations.role,
        expiresAt: invitations.expiresAt,
        acceptedAt: invitations.acceptedAt,
      })
      .from(invitations)
      .where(
        and(
          eq(invitations.tenantId, tenantId),
          isNull(invitations.acceptedAt),
          sql`${invitations.expiresAt} > now()`,
        ),
      )
      .orderBy(asc(invitations.createdAt)),
  );
}

/** Ocupação do plano: quem já entra + convites pendentes. */
export async function countSeatsUsed(tenantId: string): Promise<number> {
  return withTenant(tenantId, async (tx) => {
    const [members] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(memberships)
      .where(and(eq(memberships.tenantId, tenantId), eq(memberships.status, "ACTIVE")));

    const [pending] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(invitations)
      .where(
        and(
          eq(invitations.tenantId, tenantId),
          isNull(invitations.acceptedAt),
          sql`${invitations.expiresAt} > now()`,
        ),
      );

    return (members?.total ?? 0) + (pending?.total ?? 0);
  });
}

export type InvitationPreview = {
  id: string;
  tenantId: string;
  email: string;
  role: string;
  tenantName: string;
  expiresAt: Date;
  acceptedAt: Date | null;
};

/**
 * Leitura de convite sem tenant ativo — o convidado ainda não tem vínculo.
 * A política de `invitations` libera o convite pendente cujo `token_hash` bate
 * com `app.invite_token_hash`; nada mais fica visível nessa transação.
 */
export async function getInvitationPreview(token: string): Promise<InvitationPreview | null> {
  const tokenHash = hashInvitationToken(token);

  const rows = await withInviteToken(tokenHash, (tx) =>
    tx
      .select({
        id: invitations.id,
        tenantId: invitations.tenantId,
        email: invitations.email,
        role: invitations.role,
        tenantName: tenants.tradeName,
        expiresAt: invitations.expiresAt,
        acceptedAt: invitations.acceptedAt,
      })
      .from(invitations)
      .innerJoin(tenants, eq(tenants.id, invitations.tenantId))
      .where(eq(invitations.tokenHash, tokenHash))
      .limit(1),
  );

  return rows[0] ?? null;
}
