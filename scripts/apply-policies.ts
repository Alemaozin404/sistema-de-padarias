import { readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

/**
 * Aplica as políticas RLS. Roda com a conexão direta (não pooled) e um role
 * com privilégio de DDL — nunca com o role de runtime.
 */
async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL_UNPOOLED (ou DATABASE_URL) não definida.");
    process.exit(1);
  }

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  const file = path.join(process.cwd(), "src/db/policies/tenant_isolation.sql");
  const content = await readFile(file, "utf8");

  try {
    await sql.unsafe(content);
    console.log("Políticas RLS aplicadas.");
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
