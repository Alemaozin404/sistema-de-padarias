import { and, eq, sql } from "drizzle-orm";
import { stockBalances, stockMovements } from "@/db/schema";
import type { Database } from "@/lib/db";
import { movementDelta, type AdjustmentDirection, type MovementType } from "./rules";

/**
 * Ponto único de escrita no livro-razão de estoque.
 *
 * Estoque manual e produção usam este helper: saldo e movimento são gravados na
 * mesma transação, e a atualização condicional impede saldo negativo mesmo com
 * duas operações simultâneas. Quem chama já está dentro de `withTenant`.
 */

export class InsufficientStockError extends Error {
  constructor() {
    super("INSUFFICIENT_STOCK");
    this.name = "InsufficientStockError";
  }
}

export type LedgerInput = {
  tenantId: string;
  itemType: "INGREDIENT" | "PRODUCT";
  itemId: string;
  movementType: MovementType;
  /** Sempre positiva; o tipo (e a direção do ajuste) define o sinal. */
  quantity: number;
  adjustmentDirection?: AdjustmentDirection | null;
  unitCostCents?: number;
  reason?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  createdBy?: string | null;
};

export type LedgerResult = {
  delta: number;
  balance: string;
  movementId: string | null;
};

export async function applyStockMovement(
  tx: Database,
  input: LedgerInput,
): Promise<LedgerResult> {
  const delta = movementDelta({
    movementType: input.movementType,
    quantity: input.quantity,
    adjustmentDirection: input.adjustmentDirection ?? null,
  });
  const deltaSql = delta.toFixed(3);

  const [current] = await tx
    .select({ quantity: stockBalances.quantity })
    .from(stockBalances)
    .where(
      and(
        eq(stockBalances.tenantId, input.tenantId),
        eq(stockBalances.itemType, input.itemType),
        eq(stockBalances.itemId, input.itemId),
      ),
    )
    .limit(1);

  if (Number(current?.quantity ?? 0) + delta < 0) {
    throw new InsufficientStockError();
  }

  // O CHECK de `quantity >= 0` é avaliado na linha PROPOSTA do INSERT, antes de
  // o conflito resolver. Por isso a proposta é sempre não negativa e o sinal do
  // delta só é aplicado no UPDATE.
  const [balance] = await tx
    .insert(stockBalances)
    .values({
      tenantId: input.tenantId,
      itemType: input.itemType,
      itemId: input.itemId,
      quantity: delta >= 0 ? deltaSql : "0",
    })
    .onConflictDoUpdate({
      target: [stockBalances.tenantId, stockBalances.itemType, stockBalances.itemId],
      set: {
        quantity: sql`${stockBalances.quantity} + ${deltaSql}`,
        updatedAt: new Date(),
      },
      // Duas saídas simultâneas: só uma encontra saldo suficiente.
      setWhere: sql`${stockBalances.quantity} + ${deltaSql} >= 0`,
    })
    .returning({ quantity: stockBalances.quantity });

  if (!balance) throw new InsufficientStockError();

  const [movement] = await tx
    .insert(stockMovements)
    .values({
      tenantId: input.tenantId,
      itemType: input.itemType,
      itemId: input.itemId,
      movementType: input.movementType,
      adjustmentDirection:
        input.movementType === "ADJUSTMENT" ? (input.adjustmentDirection ?? null) : null,
      quantity: input.quantity.toFixed(3),
      unitCostCents: input.unitCostCents ?? 0,
      reason: input.reason ?? null,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      createdBy: input.createdBy ?? null,
    })
    .returning({ id: stockMovements.id });

  return {
    delta,
    balance: balance.quantity,
    movementId: movement?.id ?? null,
  };
}
