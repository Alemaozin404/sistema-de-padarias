/**
 * Regras puras do estoque.
 *
 * O saldo nunca é digitado: ele é a soma dos movimentos. Estas funções definem
 * o sinal de cada tipo e o que conta como estoque baixo — e são testadas sem
 * banco, porque um erro de sinal aqui contamina todo o livro-razão.
 */

export type MovementType =
  | "IN"
  | "OUT"
  | "ADJUSTMENT"
  | "LOSS"
  | "PRODUCTION_CONSUMPTION"
  | "PRODUCTION_OUTPUT";
export type AdjustmentDirection = "INCREASE" | "DECREASE";
export type StockItemType = "INGREDIENT" | "PRODUCT";

/** Tipos que a pessoa pode lançar manualmente na tela de estoque. */
export const MOVEMENT_TYPES: ReadonlyArray<{
  value: MovementType;
  label: string;
  sign: 1 | -1 | 0;
}> = [
  { value: "IN", label: "Entrada", sign: 1 },
  { value: "OUT", label: "Saída", sign: -1 },
  { value: "ADJUSTMENT", label: "Ajuste", sign: 0 },
  { value: "LOSS", label: "Perda", sign: -1 },
];

/** Rótulos de todos os tipos, inclusive os gerados pela produção. */
export const MOVEMENT_LABELS: Record<MovementType, string> = {
  IN: "Entrada",
  OUT: "Saída",
  ADJUSTMENT: "Ajuste",
  LOSS: "Perda",
  PRODUCTION_CONSUMPTION: "Consumo na produção",
  PRODUCTION_OUTPUT: "Entrada por produção",
};

export const INGREDIENT_UNITS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "UN", label: "Unidade" },
  { value: "KG", label: "Quilo" },
  { value: "G", label: "Grama" },
  { value: "L", label: "Litro" },
  { value: "ML", label: "Mililitro" },
  { value: "CX", label: "Caixa" },
  { value: "DZ", label: "Dúzia" },
  { value: "PC", label: "Pacote" },
];

export function isIngredientUnit(value: unknown): value is string {
  return INGREDIENT_UNITS.some((unit) => unit.value === value);
}

export function isMovementType(value: unknown): value is MovementType {
  return MOVEMENT_TYPES.some((type) => type.value === value);
}

export function isAdjustmentDirection(value: unknown): value is AdjustmentDirection {
  return value === "INCREASE" || value === "DECREASE";
}

/** Arredonda para a precisão do banco (numeric(12,3)). */
export function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Converte a quantidade digitada em número com até 3 casas.
 * Aceita "1,5", "1.5" e "1.234,567". Rejeita zero/negativo e valores fora da
 * faixa do `numeric(12,3)` — nunca assume zero por omissão.
 */
function parseDecimal(raw: string | null | undefined, allowZero: boolean): number | null {
  const cleaned = (raw ?? "").trim().replace(/\s/g, "");
  if (!cleaned) return null;

  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;

  if (!/^\d+(\.\d{1,3})?$/.test(normalized)) return null;

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  if (allowZero ? value < 0 : value <= 0) return null;
  if (value > 999_999_999.999) return null;

  return roundQuantity(value);
}

export function parseQuantity(raw: string | null | undefined): number | null {
  return parseDecimal(raw, false);
}

/** Estoque mínimo aceita zero: significa "não quero alerta". */
export function parseMinimumStock(raw: string | null | undefined): number | null {
  return parseDecimal(raw, true);
}

export type MovementInput = {
  movementType: MovementType;
  quantity: number;
  adjustmentDirection?: AdjustmentDirection | null;
};

/**
 * Delta aplicado ao saldo. `quantity` é sempre positiva; o tipo (e a direção,
 * no ajuste) define o sinal. Ajuste sem direção é erro, não zero.
 */
export function movementDelta(input: MovementInput): number {
  const quantity = roundQuantity(input.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Quantidade do movimento precisa ser maior que zero");
  }

  switch (input.movementType) {
    case "IN":
    case "PRODUCTION_OUTPUT":
      return quantity;
    case "OUT":
    case "LOSS":
    case "PRODUCTION_CONSUMPTION":
      return -quantity;
    case "ADJUSTMENT":
      if (input.adjustmentDirection === "INCREASE") return quantity;
      if (input.adjustmentDirection === "DECREASE") return -quantity;
      throw new Error("Ajuste exige direção INCREASE ou DECREASE");
  }
}

/** Motivo é obrigatório em ajuste e perda: sem justificativa, não há auditoria. */
export function requiresReason(type: string): boolean {
  return type === "ADJUSTMENT" || type === "LOSS";
}

/** Europeu/BRL: até 3 casas, sem zeros sobrando. */
export function formatQuantity(value: number | string): string {
  const numeric = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(numeric)) return "0";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(numeric);
}

export type StockStatus = "EMPTY" | "LOW" | "OK";

/**
 * "Baixo" é definido pelo mínimo do próprio insumo. Mínimo zero significa que
 * o dono não quer alerta — apenas o estoque zerado continua visível.
 */
export function stockStatus(input: { quantity: number | string; minStock: number | string }): StockStatus {
  const quantity = Number(input.quantity);
  const minStock = Number(input.minStock);

  if (!Number.isFinite(quantity) || quantity <= 0) return "EMPTY";
  if (Number.isFinite(minStock) && minStock > 0 && quantity <= minStock) return "LOW";
  return "OK";
}

export function isLowStock(input: { quantity: number | string; minStock: number | string }): boolean {
  return stockStatus(input) !== "OK";
}
