/**
 * Regras puras da produção: fator de escala da ficha técnica e custo real.
 *
 * O custo é calculado no servidor, na conclusão da fornada, com o custo atual
 * dos insumos. O teste unitário reproduz o cálculo manual para garantir que a
 * soma dos consumos e o custo por unidade fecham.
 */

import { roundQuantity } from "@/modules/inventory/rules";

export type RecipeLineCost = {
  quantity: number;
  unitCostCents: number;
};

export type ProductionCostInput = {
  yieldQuantity: number;
  producedQuantity: number;
  lossQuantity: number;
  items: ReadonlyArray<RecipeLineCost>;
};

export type ProductionCost = {
  /** Multiplicador aplicado a cada linha da ficha. */
  factor: number;
  totalCostCents: number;
  /** Custo por unidade boa. */
  unitCostCents: number;
  lossCostCents: number;
  consumptions: Array<{ quantity: number; unitCostCents: number }>;
};

/**
 * Fator = (unidades boas + perdas) / rendimento da ficha.
 * A perda também consumiu insumo, por isso entra no consumo — só não entra no
 * estoque de produto acabado.
 */
export function productionFactor(input: {
  yieldQuantity: number;
  producedQuantity: number;
  lossQuantity: number;
}): number {
  if (!Number.isFinite(input.yieldQuantity) || input.yieldQuantity <= 0) {
    throw new Error("Rendimento da ficha precisa ser maior que zero");
  }
  if (!Number.isFinite(input.producedQuantity) || input.producedQuantity <= 0) {
    throw new Error("Quantidade produzida precisa ser maior que zero");
  }
  if (!Number.isFinite(input.lossQuantity) || input.lossQuantity < 0) {
    throw new Error("Perda não pode ser negativa");
  }

  return roundQuantity(
    (input.producedQuantity + input.lossQuantity) / input.yieldQuantity,
  );
}

export function computeProductionCost(input: ProductionCostInput): ProductionCost {
  const factor = productionFactor(input);

  const consumptions = input.items.map((item) => {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      throw new Error("Item da ficha precisa ter quantidade positiva");
    }
    if (!Number.isFinite(item.unitCostCents) || item.unitCostCents < 0) {
      throw new Error("Custo do insumo não pode ser negativo");
    }

    return {
      quantity: roundQuantity(item.quantity * factor),
      unitCostCents: item.unitCostCents,
    };
  });

  const totalCostCents = Math.round(
    consumptions.reduce(
      (total, item) => total + item.quantity * item.unitCostCents,
      0,
    ),
  );

  const unitCostCents = Math.round(totalCostCents / input.producedQuantity);

  // A perda leva a fatia do custo correspondente ao que não virou produto bom.
  const madeQuantity = input.producedQuantity + input.lossQuantity;
  const lossCostCents =
    input.lossQuantity > 0
      ? Math.round((totalCostCents * input.lossQuantity) / madeQuantity)
      : 0;

  return {
    factor,
    totalCostCents,
    unitCostCents,
    lossCostCents,
    consumptions,
  };
}

export const BATCH_STATUS_LABELS: Record<string, string> = {
  PLANNED: "Planejada",
  IN_PROGRESS: "Em andamento",
  DONE: "Concluída",
  CANCELLED: "Cancelada",
};

export function batchIsEditable(status: string): boolean {
  return status === "PLANNED";
}
