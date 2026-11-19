import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  // Migrations usam a conexão direta (não pooled) e um role com privilégio de DDL.
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "",
  },
  casing: "snake_case",
  verbose: true,
  strict: true,
});
