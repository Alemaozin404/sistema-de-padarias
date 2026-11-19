import { describe, expect, it } from "vitest";
import {
  consumeRateLimit,
  resetRateLimitMemory,
} from "@/lib/rate-limit";

describe("rate limit em memória", () => {
  it("permite até o limite e bloqueia a próxima", async () => {
    resetRateLimitMemory();
    const rule = { scope: "test", identifier: "user-1", limit: 2, windowSeconds: 60 };

    const first = await consumeRateLimit(rule, 1000);
    const second = await consumeRateLimit(rule, 1001);
    const third = await consumeRateLimit(rule, 1002);

    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(1);
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(0);
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("reinicia a janela após o tempo", async () => {
    resetRateLimitMemory();
    const rule = { scope: "test", identifier: "user-2", limit: 1, windowSeconds: 10 };

    const first = await consumeRateLimit(rule, 1000);
    const after = await consumeRateLimit(rule, first.resetAt + 1);

    expect(first.allowed).toBe(true);
    expect(after.allowed).toBe(true);
  });

  it("isola escopos e identificadores", async () => {
    resetRateLimitMemory();
    const a = await consumeRateLimit(
      { scope: "a", identifier: "user", limit: 1, windowSeconds: 60 },
      1000,
    );
    const b = await consumeRateLimit(
      { scope: "b", identifier: "user", limit: 1, windowSeconds: 60 },
      1000,
    );
    const c = await consumeRateLimit(
      { scope: "a", identifier: "other", limit: 1, windowSeconds: 60 },
      1000,
    );

    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
    expect(c.allowed).toBe(true);
  });
});
