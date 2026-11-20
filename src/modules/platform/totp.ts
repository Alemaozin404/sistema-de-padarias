import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * TOTP RFC 6238 (HMAC-SHA1, 6 dígitos, janela de 30 s).
 * Implementado aqui para não depender de um serviço externo e para poder ser
 * testado com relógio fixo. O segredo nunca vai para o cliente em claro.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error("Segredo TOTP inválido.");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

function hotp(secret: string, counter: number): string {
  if (counter < 0) throw new Error("Contador TOTP inválido.");
  const key = base32Decode(secret);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac("sha1", key).update(buffer).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const code =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);

  return String(code % 1_000_000).padStart(6, "0");
}

export function totpCode(secret: string, atMs: number = Date.now()): string {
  return hotp(secret, Math.floor(atMs / 1000 / STEP_SECONDS));
}

/**
 * Valida o código e devolve o passo aceito (para impedir replay) ou null.
 * A janela aceita o passo anterior e o seguinte para tolerar relógio desalinhado.
 */
export function verifyTotp(
  secret: string,
  token: string,
  atMs: number = Date.now(),
  window = 2,
): number | null {
  const normalized = token.replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalized)) return null;

  const step = Math.floor(atMs / 1000 / STEP_SECONDS);
  const provided = Buffer.from(normalized);

  for (let delta = -window; delta <= window; delta += 1) {
    const counter = step + delta;
    if (counter < 0) continue;
    const candidate = Buffer.from(hotp(secret, counter));
    if (candidate.length === provided.length && timingSafeEqual(candidate, provided)) {
      return step + delta;
    }
  }

  return null;
}

export function otpauthUrl(input: {
  secret: string;
  email: string;
  issuer?: string;
}): string {
  const issuer = input.issuer ?? "Gestão para padarias";
  const label = encodeURIComponent(`${issuer}:${input.email}`);
  // URLSearchParams codifica espaços como "+", o que alguns aplicativos
  // autenticadores não interpretam corretamente; usamos %20 (RFC 3986).
  const params = [
    `secret=${encodeURIComponent(input.secret)}`,
    `issuer=${encodeURIComponent(issuer)}`,
    "algorithm=SHA1",
    "digits=6",
    `period=${STEP_SECONDS}`,
  ].join("&");
  return `otpauth://totp/${label}?${params}`;
}
