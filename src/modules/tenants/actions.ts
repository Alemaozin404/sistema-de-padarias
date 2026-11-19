"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAuth, getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { auditLogs, memberships, plans, session as sessionTable, subscriptions, tenants } from "@/db/schema";
import { findMembership } from "./queries";

export type SignupState = { error?: string; fieldErrors?: Record<string, string> };

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const signupSchema = z.object({
  ownerName: z.string().trim().min(2, "Informe seu nome").max(120),
  email: z.email("E-mail inválido").toLowerCase(),
  password: z.string().min(12, "Use ao menos 12 caracteres").max(128),
  tradeName: z.string().trim().min(2, "Informe o nome da padaria").max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Mínimo de 3 caracteres")
    .max(40, "Máximo de 40 caracteres")
    .regex(slugRegex, "Use apenas letras minúsculas, números e hífen"),
  whatsapp: z
    .string()
    .trim()
    .regex(/^\d{10,13}$/, "Informe DDD + número, apenas dígitos")
    .optional()
    .or(z.literal("")),
  planCode: z.enum(["ESSENCIAL", "PROFISSIONAL", "EMPRESARIAL"]),
});

/**
 * Troca o estabelecimento ativo. O destino é validado contra o banco — nunca
 * aceitamos um tenant_id vindo do formulário sem conferir o vínculo.
 */
export async function switchTenantAction(formData: FormData): Promise<void> {
  const tenantId = String(formData.get("tenantId") ?? "");

  const current = await getSession();
  if (!current?.user) redirect("/login");

  const membership = await findMembership(current.user.id, tenantId);
  if (!membership || membership.status !== "ACTIVE") {
    redirect("/dashboard");
  }

  await getDb()
    .update(sessionTable)
    .set({ activeTenantId: tenantId })
    .where(eq(sessionTable.id, current.session.id));

  redirect("/dashboard");
}

export async function signupAction(
  _prev: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const parsed = signupSchema.safeParse({
    ownerName: formData.get("ownerName"),
    email: formData.get("email"),
    password: formData.get("password"),
    tradeName: formData.get("tradeName"),
    slug: formData.get("slug"),
    whatsapp: formData.get("whatsapp") ?? "",
    planCode: formData.get("planCode"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string" && !fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    return { error: "Verifique os campos destacados.", fieldErrors };
  }

  const data = parsed.data;
  const db = getDb();

  // Slug é único globalmente: é o endereço público da vitrine.
  const [slugTaken] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, data.slug))
    .limit(1);

  if (slugTaken) {
    return { fieldErrors: { slug: "Este endereço já está em uso." } };
  }

  const [plan] = await db
    .select()
    .from(plans)
    .where(and(eq(plans.code, data.planCode), eq(plans.isActive, true)))
    .limit(1);

  if (!plan) {
    return { error: "Plano indisponível no momento. Fale com o comercial." };
  }

  // 1. Cria o usuário (Better Auth define os cookies de sessão via nextCookies).
  let userId: string;
  try {
    const result = await getAuth().api.signUpEmail({
      body: {
        name: data.ownerName,
        email: data.email,
        password: data.password,
      },
    });
    userId = result.user.id;
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("exist") || message.includes("unique")) {
      return { fieldErrors: { email: "Já existe uma conta com este e-mail." } };
    }
    return { error: "Não foi possível criar a conta. Tente novamente." };
  }

  // 2. Estabelecimento + vínculo + assinatura inicial, na mesma transação.
  try {
    await db.transaction(async (tx) => {
      const [tenant] = await tx
        .insert(tenants)
        .values({
          slug: data.slug,
          tradeName: data.tradeName,
          email: data.email,
          whatsapp: data.whatsapp || null,
        })
        .returning({ id: tenants.id });

      if (!tenant) throw new Error("Falha ao criar estabelecimento");

      await tx.insert(memberships).values({
        tenantId: tenant.id,
        userId,
        role: "OWNER",
        status: "ACTIVE",
        acceptedAt: new Date(),
      });

      // Assinatura nasce PENDING: só vira ACTIVE com pagamento confirmado.
      await tx.insert(subscriptions).values({
        tenantId: tenant.id,
        planId: plan.id,
        status: "PENDING",
        priceCents: plan.priceCents,
        activationFeeCents: plan.activationFeeCents,
      });

      await tx.insert(auditLogs).values({
        tenantId: tenant.id,
        actorType: "USER",
        actorId: userId,
        action: "tenant.created",
        entityType: "tenant",
        entityId: tenant.id,
        after: { slug: data.slug, planCode: plan.code },
      });
    });
  } catch {
    // A conta de usuário já existe; o suporte reatribui o estabelecimento
    // sem perder o acesso. O erro é registrado, não mascarado.
    return { error: "Não foi possível criar o estabelecimento. Fale com o suporte." };
  }

  redirect("/dashboard");
}
