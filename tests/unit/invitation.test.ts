import { describe, expect, it } from "vitest";
import {
  createInvitationToken,
  hashInvitationToken,
  invitationExpiry,
  isInvitationTokenShape,
  isInvitationUsable,
} from "@/modules/members/token";

describe("token de convite", () => {
  it("gera token aleatório no formato base64url", () => {
    const first = createInvitationToken();
    const second = createInvitationToken();
    expect(first).not.toBe(second);
    expect(isInvitationTokenShape(first)).toBe(true);
    expect(first.length).toBe(43);
  });

  it("guarda apenas o hash e ele é determinístico", () => {
    const token = createInvitationToken();
    const hash = hashInvitationToken(token);

    expect(hash).toHaveLength(64);
    expect(hash).toBe(hashInvitationToken(token));
    expect(hash).not.toContain(token);
  });

  it("recusa token com formato inválido", () => {
    expect(isInvitationTokenShape("curto")).toBe(false);
    expect(isInvitationTokenShape("a".repeat(42) + "!")).toBe(false);
  });

  it("expira em 7 dias", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    expect(invitationExpiry(from).toISOString()).toBe("2026-01-08T00:00:00.000Z");
  });
});

describe("isInvitationUsable", () => {
  const now = new Date("2026-06-01T12:00:00Z");

  it("aceita convite pendente e não expirado", () => {
    expect(
      isInvitationUsable({
        acceptedAt: null,
        expiresAt: new Date("2026-06-02T12:00:00Z"),
        now,
      }),
    ).toBe(true);
  });

  it("recusa expirado ou já aceito", () => {
    expect(
      isInvitationUsable({
        acceptedAt: null,
        expiresAt: new Date("2026-06-01T11:59:59Z"),
        now,
      }),
    ).toBe(false);

    expect(
      isInvitationUsable({
        acceptedAt: new Date("2026-05-30T10:00:00Z"),
        expiresAt: new Date("2026-06-05T12:00:00Z"),
        now,
      }),
    ).toBe(false);
  });
});
