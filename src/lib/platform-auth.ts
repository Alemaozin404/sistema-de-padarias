import { createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { verifyPassword } from "better-auth/crypto";
import { getDb } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { account, platformAdmins, platformSessions, user } from "@/db/schema";
import { AuthError } from "@/lib/errors";

export const PLATFORM_COOKIE = "padaria_platform_session";
const SESSION_HOURS = 8;
const REAUTH_MINUTES = 10;

export type PlatformSession = {
  sessionId: string;
  userId: string;
  email: string;
  name: string;
  role: "OWNER" | "SUPPORT";
  mfaRequired: boolean;
  mfaVerifiedAt: Date | null;
  lastReauthAt: Date | null;
  totpSecret: string | null;
  totpEnabledAt: Date | null;
  totpLastStep: number | null;
  expiresAt: Date;
};

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function encryptionKey(): Buffer {
  return createHash("sha256")
    .update(`${serverEnv().BETTER_AUTH_SECRET}:platform-totp`)
    .digest();
}

export function encryptTotpSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptTotpSecret(value: string): string {
  const [version, iv, tag, encrypted] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) {
    throw new Error("Segredo TOTP em formato desconhecido.");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export async function createPlatformSession(input: {
  userId: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);

  await getDb().insert(platformSessions).values({
    userId: input.userId,
    tokenHash: tokenHash(token),
    expiresAt,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });

  const store = await cookies();
  store.set(PLATFORM_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  return token;
}

export async function getPlatformSession(): Promise<PlatformSession | null> {
  const store = await cookies();
  const token = store.get(PLATFORM_COOKIE)?.value;
  if (!token) return null;

  const [row] = await getDb()
    .select({
      sessionId: platformSessions.id,
      userId: platformSessions.userId,
      expiresAt: platformSessions.expiresAt,
      mfaVerifiedAt: platformSessions.mfaVerifiedAt,
      lastReauthAt: platformSessions.lastReauthAt,
      email: user.email,
      name: user.name,
      role: platformAdmins.role,
      mfaRequired: platformAdmins.mfaRequired,
      isActive: platformAdmins.isActive,
      totpSecret: platformAdmins.totpSecret,
      totpEnabledAt: platformAdmins.totpEnabledAt,
      totpLastStep: platformAdmins.totpLastStep,
    })
    .from(platformSessions)
    .innerJoin(user, eq(user.id, platformSessions.userId))
    .innerJoin(platformAdmins, eq(platformAdmins.userId, platformSessions.userId))
    .where(eq(platformSessions.tokenHash, tokenHash(token)))
    .limit(1);

  if (!row || !row.isActive) return null;
  if (row.expiresAt.getTime() <= Date.now()) {
    await getDb().delete(platformSessions).where(eq(platformSessions.id, row.sessionId));
    return null;
  }
  if (row.role !== "OWNER" && row.role !== "SUPPORT") return null;

  return {
    sessionId: row.sessionId,
    userId: row.userId,
    email: row.email,
    name: row.name,
    role: row.role,
    mfaRequired: row.mfaRequired,
    mfaVerifiedAt: row.mfaVerifiedAt,
    lastReauthAt: row.lastReauthAt,
    totpSecret: row.totpSecret,
    totpEnabledAt: row.totpEnabledAt,
    totpLastStep: row.totpLastStep,
    expiresAt: row.expiresAt,
  };
}

export async function destroyPlatformSession(): Promise<void> {
  const session = await getPlatformSession();
  if (session) {
    await getDb().delete(platformSessions).where(eq(platformSessions.id, session.sessionId));
  }
  const store = await cookies();
  store.delete(PLATFORM_COOKIE);
}

export function isMfaComplete(session: PlatformSession): boolean {
  // O segundo fator é obrigatório para qualquer conta de plataforma. A flag
  // `mfaRequired` fica como registro, mas não permite atalho.
  return session.mfaVerifiedAt !== null;
}

/** Sessão válida e com segundo fator concluído. */
export async function requirePlatformAdminSession(): Promise<PlatformSession> {
  const session = await getPlatformSession();
  if (!session) {
    throw new AuthError("UNAUTHENTICATED", "Entre no painel da plataforma.");
  }
  if (!isMfaComplete(session)) {
    throw new AuthError("FORBIDDEN", "Confirme o código de dois fatores.");
  }
  return session;
}

/**
 * Ações sensíveis exigem reautenticação recente (senha novamente), mesmo com a
 * sessão de 8 horas ativa. Sem isso, um notebook destravado vira acesso total.
 */
export async function requireRecentPlatformAdmin(): Promise<PlatformSession> {
  const session = await requirePlatformAdminSession();
  const threshold = Date.now() - REAUTH_MINUTES * 60 * 1000;
  if (!session.lastReauthAt || session.lastReauthAt.getTime() < threshold) {
    throw new AuthError(
      "FORBIDDEN",
      "Reautentique-se com sua senha antes de executar esta ação.",
    );
  }
  return session;
}

export type PlatformCredentials = {
  userId: string;
  email: string;
  name: string;
  role: "OWNER" | "SUPPORT";
};

/** Valida e-mail/senha de um administrador de plataforma ativo. */
export async function verifyPlatformCredentials(
  email: string,
  password: string,
): Promise<PlatformCredentials | null> {
  const [row] = await getDb()
    .select({
      userId: user.id,
      email: user.email,
      name: user.name,
      passwordHash: account.password,
      role: platformAdmins.role,
      isActive: platformAdmins.isActive,
    })
    .from(user)
    .innerJoin(account, and(eq(account.userId, user.id), eq(account.providerId, "credential")))
    .innerJoin(platformAdmins, eq(platformAdmins.userId, user.id))
    .where(eq(user.email, email.toLowerCase()))
    .limit(1);

  if (!row || !row.isActive || !row.passwordHash) return null;
  if (row.role !== "OWNER" && row.role !== "SUPPORT") return null;

  const valid = await verifyPassword({ hash: row.passwordHash, password });
  if (!valid) return null;

  return {
    userId: row.userId,
    email: row.email,
    name: row.name,
    role: row.role,
  };
}

/** Confere a senha do admin atualmente autenticado (reautenticação). */
export async function verifyCurrentPlatformPassword(
  userId: string,
  password: string,
): Promise<boolean> {
  const [row] = await getDb()
    .select({ passwordHash: account.password })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
    .limit(1);

  if (!row?.passwordHash) return false;
  return verifyPassword({ hash: row.passwordHash, password });
}
