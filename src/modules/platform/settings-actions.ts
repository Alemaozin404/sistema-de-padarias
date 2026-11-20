"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { platformSettings } from "@/db/schema";
import { AuthError } from "@/lib/errors";
import { requireRecentPlatformAdmin } from "@/lib/platform-auth";
import { auditPlatformAction } from "./audit";

function back(key: "ok" | "erro", message: string): never {
  redirect(`/admin/configuracoes?${key}=${encodeURIComponent(message)}`);
}

export async function togglePlatformFlagAction(formData: FormData): Promise<void> {
  let session;
  try {
    session = await requireRecentPlatformAdmin();
    if (session.role !== "OWNER") throw new AuthError("FORBIDDEN", "Apenas o proprietário pode alterar configurações.");
  } catch (error) {
    back("erro", error instanceof Error ? error.message : "Acesso negado.");
  }

  const key = String(formData.get("key") ?? "");
  const value = formData.get("value") === "true";

  await getDb()
    .insert(platformSettings)
    .values({ key, value: { enabled: value }, updatedBy: session.userId, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: platformSettings.key,
      set: { value: { enabled: value }, updatedBy: session.userId, updatedAt: new Date() },
    });

  await auditPlatformAction({
    session,
    action: "platform.setting_changed",
    entityType: "platform_setting",
    entityId: key,
    after: { key, value },
  });

  revalidatePath("/admin/configuracoes");
  back("ok", "Configuração atualizada.");
}
