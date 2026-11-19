import { escapeHtml } from "@/lib/email";
import { formatBRL } from "@/modules/shared/money";

/**
 * Mensagens da régua. O template é escolhido pela configuração; o conteúdo é
 * sempre montado no servidor, com valores da fatura — nunca com texto do cliente.
 */

export type DunningMessageContext = {
  tradeName: string;
  amountCents: number;
  dueDateLabel: string;
  daysOverdue: number;
  invoiceUrl?: string | null;
};

export type DunningMessage = { subject: string; text: string; html: string };

const COPY: Record<string, { subject: string; lead: string }> = {
  due_soon: {
    subject: "Sua mensalidade vence em breve",
    lead: "Sua assinatura vence em alguns dias. O pagamento em dia mantém o painel e a vitrine funcionando.",
  },
  payment_pending: {
    subject: "Sua mensalidade vence hoje",
    lead: "A fatura da sua assinatura vence hoje. Pague pelo link ou pelo Pix da área de assinatura.",
  },
  overdue: {
    subject: "Mensalidade em atraso",
    lead: "Identificamos uma fatura em atraso. Regularize para evitar avisos e restrições.",
  },
  restriction_warning: {
    subject: "Aviso: edições podem ser restringidas",
    lead: "A fatura continua em aberto. Se o atraso persistir, as edições operacionais serão bloqueadas; consulta e exportação dos seus dados continuam liberadas.",
  },
  suspension_warning: {
    subject: "Aviso: serviços podem ser suspensos",
    lead: "A fatura segue em aberto após o prazo de restrição. O painel operacional pode ser suspenso, mas seus dados e a área de pagamento continuam acessíveis.",
  },
  termination_warning: {
    subject: "Aviso importante sobre sua assinatura",
    lead: "O atraso atingiu o prazo máximo da régua. Regularize agora para evitar o encerramento da assinatura. Seus dados e a exportação permanecem disponíveis.",
  },
};

export function renderDunningMessage(
  template: string,
  context: DunningMessageContext,
): DunningMessage {
  const copy = COPY[template] ?? {
    subject: "Atualização da sua assinatura",
    lead: "Há uma atualização sobre a fatura da sua assinatura.",
  };

  const amount = formatBRL(context.amountCents);
  const lateLine =
    context.daysOverdue > 0
      ? `Atraso atual: ${context.daysOverdue} dia(s).`
      : "A fatura ainda está dentro do prazo.";

  const linkLine = context.invoiceUrl
    ? `Pagamento e fatura: ${context.invoiceUrl}`
    : "Acesse a área Assinatura no painel para pagar.";

  const text = [
    `Olá, ${context.tradeName}.`,
    "",
    copy.lead,
    "",
    `Fatura: ${amount}`,
    `Vencimento: ${context.dueDateLabel}`,
    lateLine,
    linkLine,
    "",
    "Se o pagamento já foi feito, desconsidere este aviso e consulte a confirmação no painel.",
  ].join("\n");

  const html = [
    `<p>Olá, ${escapeHtml(context.tradeName)}.</p>`,
    `<p>${escapeHtml(copy.lead)}</p>`,
    `<p><strong>Fatura:</strong> ${escapeHtml(amount)}<br />`,
    `<strong>Vencimento:</strong> ${escapeHtml(context.dueDateLabel)}<br />`,
    `<strong>${escapeHtml(lateLine)}</strong></p>`,
    context.invoiceUrl
      ? `<p><a href="${escapeHtml(context.invoiceUrl)}">Abrir fatura para pagamento</a></p>`
      : `<p>Acesse a área <strong>Assinatura</strong> no painel para pagar.</p>`,
    `<p>Se o pagamento já foi feito, desconsidere este aviso e consulte a confirmação no painel.</p>`,
  ].join("");

  return { subject: copy.subject, text, html };
}

export const DUNNING_TEMPLATES = Object.keys(COPY);
