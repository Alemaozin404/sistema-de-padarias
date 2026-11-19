import { describe, expect, it } from "vitest";
import { slugify, uniqueSlug } from "@/modules/catalog/slug";

describe("slugify", () => {
  it("remove acentos e normaliza espaços", () => {
    expect(slugify("Pão de Queijo")).toBe("pao-de-queijo");
    expect(slugify("  Croissant  Manteiga ")).toBe("croissant-manteiga");
  });

  it("troca símbolos por hífen único", () => {
    expect(slugify("Bolo R$ 8,00 (fatia)")).toBe("bolo-r-8-00-fatia");
  });

  it("não termina com hífen e limita o tamanho", () => {
    expect(slugify("Café ----")).toBe("cafe");
    expect(slugify("a".repeat(120)).length).toBe(60);
  });

  it("nunca retorna vazio", () => {
    expect(slugify("!!!")).toBe("item");
    expect(slugify("")).toBe("item");
  });
});

describe("uniqueSlug", () => {
  it("mantém o slug quando livre", () => {
    expect(uniqueSlug("Pão Francês", ["pao-de-queijo"])).toBe("pao-frances");
  });

  it("acrescenta sufixo quando já existe", () => {
    expect(uniqueSlug("Pão Francês", ["pao-frances"])).toBe("pao-frances-2");
    expect(uniqueSlug("Pão Francês", ["pao-frances", "pao-frances-2"])).toBe("pao-frances-3");
  });

  it("respeita o limite de tamanho ao criar sufixo", () => {
    const long = "a".repeat(60);
    const result = uniqueSlug(long, [long]);
    expect(result.length).toBeLessThanOrEqual(60);
    expect(result.endsWith("-2")).toBe(true);
  });
});
