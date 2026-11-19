import { and, eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { account, platformAdmins, user } from "../src/db/schema/index.js";
import { uuidv7 } from "../src/lib/id.js";

/**
 * Provisiona o primeiro administrador da plataforma (ou redefine a senha de um
 * existente). Nunca é chamado pela aplicação; exige acesso ao banco.
 *
 * Uso:
 *   npm run admin:create -- email@dominio.com "senha-com-12-caracteres" "Nome" OWNER
 */
async function main() {
  const [email, password, name = "Proprietário", role = "OWNER"] = process.argv.slice(2);

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error('Uso: npm run admin:create -- email@dominio.com "senha" "Nome" [OWNER|SUPPORT]');
    process.exit(1);
  }
  if (!password || password.length < 12) {
    console.error("A senha precisa ter ao menos 12 caracteres.");
    process.exit(1);
  }
  if (role !== "OWNER" && role !== "SUPPORT") {
    console.error("Papel inválido: use OWNER ou SUPPORT.");
    process.exit(1);
  }

  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL não definida.");
    process.exit(1);
  }

  const client = postgres(url, { max: 1, onnotice: () => {} });
  const db = drizzle(client, { casing: "snake_case" });

  try {
    const normalized = email.toLowerCase();
    const passwordHash = await hashPassword(password);

    await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(user).where(eq(user.email, normalized)).limit(1);
      const userId = existing?.id ?? uuidv7();

      if (!existing) {
        await tx.insert(user).values({
          id: userId,
          name,
          email: normalized,
          emailVerified: true,
        });
      }

      const [credential] = await tx
        .select()
        .from(account)
        .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
        .limit(1);

      if (credential) {
        await tx
          .update(account)
          .set({ password: passwordHash, updatedAt: new Date() })
          .where(eq(account.id, credential.id));
      } else {
        await tx.insert(account).values({
          id: uuidv7(),
          accountId: userId,
          providerId: "credential",
          userId,
          password: passwordHash,
        });
      }

      await tx
        .insert(platformAdmins)
        .values({
          userId,
          role,
          mfaRequired: true,
          isActive: true,
        })
        .onConflictDoUpdate({
          target: platformAdmins.userId,
          set: { role, isActive: true, mfaRequired: true, updatedAt: new Date() },
        });
    });

    console.log(
      `Administrador provisionado: ${normalized} (${role}). No primeiro login, cadastre o TOTP.`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
