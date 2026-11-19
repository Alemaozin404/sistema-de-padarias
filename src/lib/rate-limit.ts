import { createHash } from "node:crypto";
import { upstashConfig } from "@/lib/env";

/**
 * Rate limit por janela fixa.
 *
 * Duas implementações:
 *  - Upstash Redis (REST), quando configurado — vale para todas as instâncias
 *    serverless e é o modo esperado em produção;
 *  - memória do processo, como fallback para desenvolvimento, testes e para não
 *    derrubar o login inteiro se o Redis estiver indisponível. Em várias
 *    instâncias o limite fica mais frouxo, mas nunca mais permissivo que "sem
 *    limite".
 *
 * O identificador (e-mail, IP, id de usuário) nunca é gravado em claro: a chave
 * usa SHA-256 do valor.
 */

export type RateLimitRule = {
  scope: string;
  identifier: string;
  limit: number;
  windowSeconds: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: number;
};

type Bucket = { count: number; resetAt: number };

const memory = new Map<string, Bucket>();

/** Somente para testes: isola um cenário do outro. */
export function resetRateLimitMemory(): void {
  memory.clear();
}

function hashIdentifier(scope: string, identifier: string): string {
  return createHash("sha256").update(`${scope}:${identifier}`).digest("hex");
}

function incrementMemory(key: string, windowSeconds: number, now: number): Bucket {
  const current = memory.get(key);
  if (!current || current.resetAt <= now) {
    const bucket: Bucket = { count: 1, resetAt: now + windowSeconds * 1000 };
    memory.set(key, bucket);
    return bucket;
  }

  current.count += 1;
  return current;
}

/**
 * Incrementa no Upstash. `EXPIRE ... NX` só cria o TTL na primeira batida, o
 * que mantém a janela fixa (não vira janela infinita sob ataque contínuo).
 * Retorna `null` em qualquer falha para o chamador cair no fallback local.
 */
async function incrementUpstash(
  key: string,
  windowSeconds: number,
  now: number,
): Promise<Bucket | null> {
  const { url, token } = upstashConfig();
  if (!url || !token) return null;

  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, windowSeconds, "NX"],
      ]),
      cache: "no-store",
      signal: AbortSignal.timeout(1500),
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as Array<{ result?: unknown }>;
    const count = Number(payload[0]?.result);
    if (!Number.isFinite(count)) return null;

    return { count, resetAt: now + windowSeconds * 1000 };
  } catch {
    // Redis fora do ar não pode bloquear todo mundo: cai no contador local.
    return null;
  }
}

export async function consumeRateLimit(
  rule: RateLimitRule,
  now: number = Date.now(),
): Promise<RateLimitResult> {
  const key = `ratelimit:${rule.scope}:${hashIdentifier(rule.scope, rule.identifier)}`;

  // Poda barata para o fallback em memória não crescer sem limite.
  if (memory.size > 5_000) {
    for (const [storedKey, bucket] of memory) {
      if (bucket.resetAt <= now) memory.delete(storedKey);
    }
  }

  const bucket =
    (await incrementUpstash(key, rule.windowSeconds, now)) ??
    incrementMemory(key, rule.windowSeconds, now);

  const allowed = bucket.count <= rule.limit;
  const retryAfterSeconds = allowed
    ? 0
    : Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

  return {
    allowed,
    limit: rule.limit,
    remaining: Math.max(0, rule.limit - bucket.count),
    retryAfterSeconds,
    resetAt: bucket.resetAt,
  };
}

/**
 * IP do cliente atrás do proxy da Vercel/Cloudflare. O header pode ser
 * falsificado fora de um proxy confiável, por isso ele nunca é a única defesa:
 * login também tem limite por e-mail e o 2FA por usuário.
 */
export function clientIpFrom(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}

export const RATE_LIMIT_MESSAGE =
  "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.";
