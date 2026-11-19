"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AuthError, getSession, requireTenant } from "@/lib/auth";
import { getDb, withTenant } from "@/lib/db";
import { auditLogs, invitations, memberships, session as sessionTable } from "@/db/schema";
import { loadEntitlements } from "@/modules/billing/queries";
import { isWithinLimit } from "@/modules/plans/entitlements";
import { publicEnv } from "@/lib/env";
import { countSeatsUsed, getInvitationPreview, listMembers } from "./queries";
import {
  createInvitationToken,
  hashInvitationToken,
  invitationExpiry,
  isInvitationTokenShape,
  isInvitationUsable,
} from "./token";

/**
 * Equipe do estabelecimento.
 *
 * Regras no servidor:
 *  - convite exige assento livre no plano;
 *  - convite é um token aleatório; o banco guarda só o hash;
 *  - aceitar exige sessão com o MESMO e-mail convidado;
 *  - ninguém remove o último proprietário.
 */

export type TeamState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
  inviteUrl?: string;
};

const inviteSchema = z.object({
  email: z.email("E-mail inválido").toLowerCase(),
  role: z.enum(["MANAGER", "STAFF"]),
});

function fieldErrorsFrom(issues: z.ZodIssue[]): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !fieldErrors[field]) fieldErrors[field] = issue.message;
  }
  return fieldErrors;
}

export async function inviteMemberAction(
  _prev: TeamState,
  formData: FormData,
): Promise<TeamState> {
  const membership = await requireTenant(["OWNER", "MANAGER"]);

  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    return { error: "Verifique os dados do convite.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const loaded = await loadEntitlements(membership.tenantId);
  if (!loaded) return { error: "Nenhuma assinatura ativa encontrada." };
  if (!loaded.entitlements.access.canWriteOperational) {
    return { error: loaded.entitlements.warning ?? "Operação suspensa por pendência financeira." };
  }

  const seats = await countSeatsUsed(membership.tenantId);
  if (!isWithinLimit(loaded.entitlements, "users.max", seats)) {
    const limit = loaded.entitlements.limits["users.max"];
    return {
      error: `Seu plano permite ${limit} usuários (incluindo convites pendentes). Faça upgrade para adicionar mais.`,
    };
  }

  // Já é membro?
  const members = await listMembers(membership.tenantId);
  if (members.some((member) => member.email.toLowerCase() === parsed.data.email)) {
    return { fieldErrors: { email: "Esta pessoa já faz parte da equipe." } };
  }

  const token = createInvitationToken();
  const tokenHash = hashInvitationToken(token);
  const expiresAt = invitationExpiry();

  try {
    await withTenant(membership.tenantId, async (tx) => {
      const pending = await tx
        .select({ id: invitations.id })
        .from(invitations)
        .where(
          and(
            eq(invitations.tenantId, membership.tenantId),
            eq(invitations.email, parsed.data.email),
            isNull(invitations.acceptedAt),
            sql`${invitations.expiresAt} > now()`,
          ),
        )
        .limit(1);

      if (pending.length > 0) throw new Error("PENDING");

      const [created] = await tx
        .insert(invitations)
        .values({
          tenantId: membership.tenantId,
          email: parsed.data.email,
          role: parsed.data.role,
          tokenHash,
          expiresAt,
          createdBy: membership.userId,
        })
        .returning({ id: invitations.id });

      await tx.insert(auditLogs).values({
        tenantId: membership.tenantId,
        actorType: "USER",
        actorId: membership.userId,
        action: "member.invited",
        entityType: "invitation",
        entityId: created?.id,
        after: { email: parsed.data.email, role: parsed.data.role },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "PENDING") {
      return {
        fieldErrors: { email: "Já existe um convite pendente para este e-mail." },
      };
    }
    return { error: "Não foi possível criar o convite. Tente novamente." };
  }

  revalidatePath("/equipe");

  const inviteUrl = `${publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/convite/${token}`;

  return {
    success:
      "Convite criado. Envie o link abaixo para a pessoa — o envio automático de e-mail ainda não está configurado nesta instalação.",
    inviteUrl,
  };
}

export async function revokeInvitationAction(formData: FormData): Promise<void> {
  const membership = await requireTenant(["OWNER", "MANAGER"]);
  const invitationId = String(formData.get("invitationId") ?? "");

  await withTenant(membership.tenantId, async (tx) => {
    await tx
      .delete(invitations)
      .where(
        and(
          eq(invitations.tenantId, membership.tenantId),
          eq(invitations.id, invitationId),
          isNull(invitations.acceptedAt),
        ),
      );

    await tx.insert(auditLogs).values({
      tenantId: membership.tenantId,
      actorType: "USER",
      actorId: membership.userId,
      action: "member.invite_revoked",
      entityType: "invitation",
      entityId: invitationId,
    });
  });

  revalidatePath("/equipe");
}

const roleSchema = z.object({
  memberId: z.string().min(1),
  role: z.enum(["MANAGER", "STAFF"]),
});

export async function changeMemberRoleAction(formData: FormData): Promise<void> {
  const membership = await requireTenant(["OWNER"]);
  const parsed = roleSchema.safeParse({
    memberId: formData.get("memberId"),
    role: formData.get("role"),
  });
  if (!parsed.success) return;

  await withTenant(membership.tenantId, async (tx) => {
    await tx
      .update(memberships)
      .set({ role: parsed.data.role, updatedAt: new Date() })
      .where(
        and(
          eq(memberships.tenantId, membership.tenantId),
          eq(memberships.id, parsed.data.memberId),
          // O proprietário não tem o próprio perfil rebaixado por aqui.
          eq(memberships.role, "STAFF"),
        ),
      );

    await tx.insert(auditLogs).values({
      tenantId: membership.tenantId,
      actorType: "USER",
      actorId: membership.userId,
      action: "member.role_changed",
      entityType: "membership",
      entityId: parsed.data.memberId,
      after: { role: parsed.data.role },
    });
  });

  revalidatePath("/equipe");
}

export async function disableMemberAction(formData: FormData): Promise<void> {
  const membership = await requireTenant(["OWNER"]);
  const memberId = String(formData.get("memberId") ?? "");

  const members = await listMembers(membership.tenantId);
  const target = members.find((member) => member.id === memberId);
  if (!target) return;
  if (target.userId === membership.userId) return; // não se remove
  if (target.role === "OWNER") return; // proprietário só sai por transferência (fase futura)

  await withTenant(membership.tenantId, async (tx) => {
    await tx
      .update(memberships)
      .set({ status: "DISABLED", updatedAt: new Date() })
      .where(
        and(eq(memberships.tenantId, membership.tenantId), eq(memberships.id, memberId)),
      );

    await tx.insert(auditLogs).values({
      tenantId: membership.tenantId,
      actorType: "USER",
      actorId: membership.userId,
      action: "member.disabled",
      entityType: "membership",
      entityId: memberId,
    });
  });

  revalidatePath("/equipe");
}

export type AcceptInviteState = { error?: string };

export async function acceptInvitationAction(
  _prev: AcceptInviteState,
  formData: FormData,
): Promise<AcceptInviteState> {
  const token = String(formData.get("token") ?? "");
  if (!isInvitationTokenShape(token)) {
    return { error: "Este link de convite é inválido." };
  }

  const current = await getSession();
  if (!current?.user) {
    redirect(`/login?convite=${encodeURIComponent(token)}`);
  }

  let preview;
  try {
    preview = await getInvitationPreview(token);
  } catch {
    return { error: "Não foi possível validar o convite. Tente novamente." };
  }

  if (!preview) return { error: "Convite não encontrado ou expirado." };
  if (!isInvitationUsable(preview)) {
    return { error: "Este convite expirou ou já foi utilizado." };
  }
  if (preview.email.toLowerCase() !== current.user.email.toLowerCase()) {
    return {
      error: `Este convite foi enviado para ${preview.email}. Entre com essa conta para aceitar.`,
    };
  }

  try {
    await withTenant(preview.tenantId, async (tx) => {
      const [existing] = await tx
        .select({ id: memberships.id })
        .from(memberships)
        .where(
          and(
            eq(memberships.tenantId, preview.tenantId),
            eq(memberships.userId, current.user.id),
          ),
        )
        .limit(1);

      if (existing) {
        // Já faz parte: reativa em vez de duplicar.
        await tx
          .update(memberships)
          .set({ status: "ACTIVE", role: preview.role, updatedAt: new Date() })
          .where(eq(memberships.id, existing.id));
      } else {
        await tx.insert(memberships).values({
          tenantId: preview.tenantId,
          userId: current.user.id,
          role: preview.role,
          status: "ACTIVE",
          invitedBy: null,
          acceptedAt: new Date(),
        });
      }

      await tx
        .update(invitations)
        .set({ acceptedAt: new Date() })
        .where(
          and(
            eq(invitations.tenantId, preview.tenantId),
            eq(invitations.id, preview.id),
            isNull(invitations.acceptedAt),
          ),
        );

      await tx.insert(auditLogs).values({
        tenantId: preview.tenantId,
        actorType: "USER",
        actorId: current.user.id,
        action: "member.joined",
        entityType: "membership",
        entityId: preview.id,
        after: { role: preview.role, email: preview.email },
      });
    });
  } catch (error) {
    if (error instanceof AuthError) throw error;
    return { error: "Não foi possível aceitar o convite. Fale com quem enviou." };
  }

  // Passa a operar no estabelecimento que acabou de entrar.
  await getDb()
    .update(sessionTable)
    .set({ activeTenantId: preview.tenantId })
    .where(eq(sessionTable.id, current.session.id));

  redirect("/dashboard");
}
