import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { platformAdmins, platformSessions } from "@/db/schema";
import {
  decryptTotpSecret,
  encryptTotpSecret,
  verifyCurrentPlatformPassword,
  type PlatformSession,
} from "@/lib/platform-auth";
import { generateTotpSecret, verifyTotp } from "./totp";

/** Segredo já existente é decifrado; no primeiro login é gerado e persistido. */
export async function ensureTotpSecret(
  userId: string,
  storedEncrypted: string | null,
): Promise<string> {
  if (storedEncrypted) return decryptTotpSecret(storedEncrypted);

  const secret = generateTotpSecret();
  await getDb()
    .update(platformAdmins)
    .set({ totpSecret: encryptTotpSecret(secret), updatedAt: new Date() })
    .where(eq(platformAdmins.userId, userId));
  return secret;
}

export type TotpResult = "OK" | "INVALID" | "REPLAY";

/** Confirma o TOTP e marca a sessão como autenticada em dois fatores. */
export async function completeTotp(
  session: PlatformSession,
  token: string,
): Promise<TotpResult> {
  if (!session.totpSecret) return "INVALID";
  const secret = decryptTotpSecret(session.totpSecret);
  const now = Date.now();
  const step = verifyTotp(secret, token, now);

  if (step === null) return "INVALID";
  // Um código já usado não pode ser reapresentado dentro da janela de 30 s.
  if (session.totpLastStep !== null && step <= session.totpLastStep) return "REPLAY";

  const timestamp = new Date(now);
  await getDb().transaction(async (tx) => {
    await tx
      .update(platformSessions)
      .set({ mfaVerifiedAt: timestamp, lastReauthAt: timestamp, updatedAt: timestamp })
      .where(eq(platformSessions.id, session.sessionId));

    await tx
      .update(platformAdmins)
      .set({
        totpEnabledAt: session.totpEnabledAt ?? timestamp,
        totpLastStep: step,
        lastMfaAt: timestamp,
        updatedAt: timestamp,
      })
      .where(eq(platformAdmins.userId, session.userId));
  });

  return "OK";
}

export async function reauthenticate(
  session: PlatformSession,
  password: string,
): Promise<boolean> {
  if (!(await verifyCurrentPlatformPassword(session.userId, password))) return false;

  await getDb()
    .update(platformSessions)
    .set({ lastReauthAt: new Date(), updatedAt: new Date() })
    .where(eq(platformSessions.id, session.sessionId));

  return true;
}
