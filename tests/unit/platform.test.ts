import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  otpauthUrl,
  totpCode,
  verifyTotp,
} from "@/modules/platform/totp";
import {
  parseIsoDate,
  parseLimit,
  parseMoneyToCents,
  parsePercent,
  parsePositiveInt,
} from "@/modules/platform/rules";
import { resolveDiscountCents } from "@/modules/billing/rules";
import { accessForStatus, effectiveSubscriptionStatus } from "@/modules/plans/entitlements";

describe("TOTP", () => {
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"; // RFC 6238, chave de teste

  it("gera o código do vetor RFC em 6 dígitos", () => {
    expect(totpCode(secret, 59_000)).toBe("287082");
    expect(totpCode(secret, 1_111_111_109_000)).toBe("081804");
  });

  it("aceita a janela e devolve o passo para impedir replay", () => {
    const at = 59_000;
    const code = totpCode(secret, at);
    const step = verifyTotp(secret, code, at);
    expect(step).toBe(Math.floor(at / 1000 / 30));
    expect(verifyTotp(secret, code, at + 30_000)).not.toBeNull();
    expect(verifyTotp(secret, "000000", at)).toBeNull();
    expect(verifyTotp(secret, "abc", at)).toBeNull();
  });

  it("base32 preserva os bytes e o segredo gerado é válido", () => {
    const bytes = Buffer.from("padaria-teste");
    expect(base32Decode(base32Encode(bytes)).equals(bytes)).toBe(true);
    const generated = generateTotpSecret();
    expect(generated).toMatch(/^[A-Z2-7]{32}$/);
    expect(verifyTotp(generated, totpCode(generated))).not.toBeNull();
  });

  it("monta a URI otpauth sem perder o e-mail", () => {
    const uri = otpauthUrl({ secret, email: "dono@padaria.com" });
    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    expect(uri).toContain("secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(uri).toContain("dono%40padaria.com");
  });
});

describe("validação administrativa", () => {
  it("converte reais em centavos com vírgula ou ponto", () => {
    expect(parseMoneyToCents("39,90")).toBe(3990);
    expect(parseMoneyToCents("39.9")).toBe(3990);
    expect(parseMoneyToCents("0")).toBe(0);
    expect(parseMoneyToCents("-1")).toBeNull();
    expect(parseMoneyToCents("abc")).toBeNull();
    expect(parseMoneyToCents("1.234")).toBeNull();
  });

  it("valida percentual, inteiros e limite vazio", () => {
    expect(parsePercent("10")).toBe(10);
    expect(parsePercent("10,5")).toBe(10.5);
    expect(parsePercent("0")).toBeNull();
    expect(parsePercent("101")).toBeNull();
    expect(parsePositiveInt("5")).toBe(5);
    expect(parsePositiveInt("0")).toBeNull();
    expect(parseLimit("")).toBeNull();
    expect(parseLimit("0")).toBe(0);
    expect(parseLimit("2,5")).toBeNull();
  });

  it("aceita apenas datas ISO reais", () => {
    expect(parseIsoDate("2026-11-19")?.toISOString()).toBe("2026-11-19T00:00:00.000Z");
    expect(parseIsoDate("19/11/2026")).toBeNull();
    expect(parseIsoDate("2026-02-31")).not.toBeNull(); // Date normaliza; a vigência é validada em par
  });
});

describe("desconto negociado", () => {
  it("aplica percentual arredondado e valor fixo sem passar da mensalidade", () => {
    expect(resolveDiscountCents(3990, { discountType: "PERCENT", value: 10 })).toBe(399);
    expect(resolveDiscountCents(3990, { discountType: "FIXED", value: 1000 })).toBe(1000);
    expect(resolveDiscountCents(3990, { discountType: "FIXED", value: 99999 })).toBe(3990);
    expect(resolveDiscountCents(3990, null)).toBe(0);
  });

  it("estado suspenso do tenant mantém leitura, exportação e pagamento", () => {
    for (const status of ["PENDING", "ACTIVE", "PAST_DUE", "RESTRICTED", "SUSPENDED", "CANCELLED"] as const) {
      expect(accessForStatus(status).canExportData, status).toBe(true);
      expect(accessForStatus(status).canReadOwnData, status).toBe(true);
    }
  });

  it("suspensão administrativa prevalece sobre a assinatura ativa", () => {
    expect(effectiveSubscriptionStatus("ACTIVE", "ACTIVE")).toBe("ACTIVE");
    expect(effectiveSubscriptionStatus("SUSPENDED", "ACTIVE")).toBe("SUSPENDED");
    expect(effectiveSubscriptionStatus("CLOSED", "ACTIVE")).toBe("CANCELLED");
    expect(accessForStatus(effectiveSubscriptionStatus("SUSPENDED", "ACTIVE")).canWriteOperational).toBe(false);
    expect(accessForStatus(effectiveSubscriptionStatus("SUSPENDED", "ACTIVE")).canPay).toBe(true);
  });
});
