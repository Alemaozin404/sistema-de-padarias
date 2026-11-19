/**
 * Dinheiro é sempre inteiro em centavos. Nenhum float circula no domínio:
 * formatação é responsabilidade da borda (UI), não do cálculo.
 */

export function assertCents(value: number, field = "valor"): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} deve ser inteiro em centavos e não negativo (recebido: ${value})`);
  }
}

export function formatBRL(cents: number): string {
  assertCents(cents);
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

export type ChargeBasis = {
  /** Valor sobre o qual multa e juros incidem (mensalidade, sem ativação). */
  principalCents: number;
  /** Dias corridos de atraso. 0 ou negativo = não há encargo. */
  daysOverdue: number;
  /** Multa única em percentual, ex.: 2 para 2%. */
  finePercent: number;
  /** Juros simples ao mês, ex.: 1 para 1% ao mês. */
  interestPercentMonth: number;
};

export type ChargeResult = {
  fineCents: number;
  interestCents: number;
  totalCents: number;
};

/**
 * Multa única de 2% + juros simples de 1% ao mês pro rata die.
 * Arredondamento sempre para cima no centavo (nunca cobrar menos que o
 * percentual contratado, nunca criar taxa diária escondida).
 *
 * Juros usam 30 dias como mês comercial e são calculados sobre o principal,
 * não sobre o principal + multa (evita juros sobre juros).
 */
export function computeLateCharges(basis: ChargeBasis): ChargeResult {
  assertCents(basis.principalCents, "principalCents");
  if (basis.finePercent < 0 || basis.interestPercentMonth < 0) {
    throw new Error("Percentuais de encargo não podem ser negativos");
  }

  if (basis.daysOverdue <= 0 || basis.principalCents === 0) {
    return { fineCents: 0, interestCents: 0, totalCents: basis.principalCents };
  }

  const fineCents = Math.ceil((basis.principalCents * basis.finePercent) / 100);
  // Divisão em duas etapas para preservar precisão inteira: (principal * % * dias) / (100 * 30)
  const interestCents = Math.ceil(
    (basis.principalCents * basis.interestPercentMonth * basis.daysOverdue) / (100 * 30),
  );

  return {
    fineCents,
    interestCents,
    totalCents: basis.principalCents + fineCents + interestCents,
  };
}

export type InvoiceAmounts = {
  planAmountCents: number;
  activationAmountCents: number;
  discountCents: number;
  fineCents: number;
  interestCents: number;
};

/**
 * Regra de consistência da fatura:
 * total = plano + ativação + multa + juros - desconto.
 */
export function invoiceTotal(amounts: InvoiceAmounts): number {
  const total =
    amounts.planAmountCents +
    amounts.activationAmountCents +
    amounts.fineCents +
    amounts.interestCents -
    amounts.discountCents;

  if (total < 0) {
    throw new Error("Total da fatura não pode ser negativo");
  }
  return total;
}

/** Dias corridos de atraso entre o vencimento e a data de referência. */
export function daysOverdue(dueDate: Date, reference: Date): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const due = Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate());
  const ref = Date.UTC(
    reference.getUTCFullYear(),
    reference.getUTCMonth(),
    reference.getUTCDate(),
  );
  return Math.floor((ref - due) / MS_PER_DAY);
}
