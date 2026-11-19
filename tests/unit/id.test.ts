import { describe, expect, it } from "vitest";
import { uuidv7, uuidv7Timestamp } from "@/lib/id";

describe("UUID v7", () => {
  it("segue o formato canônico com versão 7", () => {
    const id = uuidv7();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("é ordenável por tempo", () => {
    const early = uuidv7(1_700_000_000_000);
    const late = uuidv7(1_800_000_000_000);
    expect(early < late).toBe(true);
  });

  it("recupera o timestamp embutido", () => {
    const when = 1_765_000_000_000;
    const id = uuidv7(when);
    expect(uuidv7Timestamp(id)?.getTime()).toBe(when);
  });

  it("não gera colisão em lote", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => uuidv7()));
    expect(ids.size).toBe(1000);
  });
});
