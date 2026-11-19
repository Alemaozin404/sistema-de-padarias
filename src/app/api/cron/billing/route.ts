import { serverEnv } from "@/lib/env";
import { constantTimeTokenEqual } from "@/modules/billing/rules";
import {
  generateRenewalInvoices,
  markOverdueInvoices,
  reconcileOpenInvoices,
} from "@/modules/billing/service";
import { runDunning } from "@/modules/dunning/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Job diário de cobrança:
 *  1. emite renovação de quem venceu;
 *  2. marca faturas vencidas e a assinatura como PAST_DUE;
 *  3. concilia as faturas abertas com o gateway;
 *  4. executa a régua: encargos, notificações e transições de estado.
 *
 * A Vercel envia `Authorization: Bearer $CRON_SECRET`. Sem segredo, o endpoint
 * não existe operacionalmente (503), em vez de ficar aberto.
 */
async function run(request: Request): Promise<Response> {
  const env = serverEnv();
  if (!env.CRON_SECRET) {
    return Response.json({ error: "Cron não configurado." }, { status: 503 });
  }

  const authorization = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${env.CRON_SECRET}`;
  if (!constantTimeTokenEqual(authorization, expected)) {
    return Response.json({ error: "Não autorizado." }, { status: 401 });
  }

  const renewals = await generateRenewalInvoices();
  const overdue = await markOverdueInvoices();
  const reconciliation = await reconcileOpenInvoices();
  // A régua roda depois da conciliação: quem pagou agora não recebe aviso.
  const dunning = await runDunning();

  return Response.json({ ok: true, renewals, overdue, reconciliation, dunning });
}

export async function GET(request: Request): Promise<Response> {
  return run(request);
}

export async function POST(request: Request): Promise<Response> {
  return run(request);
}
