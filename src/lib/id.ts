import { randomBytes } from "node:crypto";

/**
 * Gera UUID v7 (RFC 9562): timestamp de 48 bits + versão + aleatoriedade.
 * Vantagem sobre v4: ordenação cronológica, o que melhora a localidade de índice
 * em tabelas que crescem como stock_movements, invoices e audit_logs.
 */
export function uuidv7(now: number = Date.now()): string {
  const bytes = randomBytes(16);

  // 48 bits de timestamp (ms) nos 6 primeiros bytes.
  bytes.writeUIntBE(now, 0, 6);

  // Versão 7 (bits 48-51) e variante RFC 4122 (bits 64-65).
  const b6 = bytes[6]!;
  bytes[6] = (b6 & 0x0f) | 0x70;
  const b8 = bytes[8]!;
  bytes[8] = (b8 & 0x3f) | 0x80;

  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

/** Timestamp embutido em um UUID v7 (útil para ordenar sem coluna extra). */
export function uuidv7Timestamp(id: string): Date | null {
  const hex = id.replace(/-/g, "");
  if (hex.length !== 32 || hex[12] !== "7") return null;
  const ms = Number.parseInt(hex.slice(0, 12), 16);
  return Number.isFinite(ms) ? new Date(ms) : null;
}
