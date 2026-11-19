import { createHash, randomBytes } from "node:crypto";

/**
 * Tokens de convite.
 *
 * O token em claro só existe no link entregue ao convidado. O banco guarda o
 * SHA-256 — vazamento do banco não permite aceitar convites pendentes.
 */

export function createInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** base64url de 32 bytes = 43 caracteres. */
export function isInvitationTokenShape(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export const INVITATION_TTL_DAYS = 7;

export function invitationExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export function isInvitationUsable(invitation: {
  acceptedAt: Date | null;
  expiresAt: Date;
  now?: Date;
}): boolean {
  const now = invitation.now ?? new Date();
  return invitation.acceptedAt === null && invitation.expiresAt.getTime() > now.getTime();
}
