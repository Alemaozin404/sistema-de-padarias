"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { backupRuns } from "@/db/schema";
import { AuthError } from "@/lib/errors";
import { requireRecentPlatformAdmin } from "@/lib/platform-auth";
import { auditPlatformAction } from "./audit";

export async function markRestoreTestedAction(formData: FormData): Promise<void> {
  let session;
  try {
    session = await requireRecentPlatformAdmin();
    if (session.role !== "OWNER") {
      throw new AuthError("FORBIDDEN", "Apenas o proprietário pode registrar restore.");
    }
  } catch (error) {
    redirect(`/admin/sistema?erro=${encodeURIComponent(error instanceof Error ? error.message : "Acesso negado.")}`);
  }

  const parsed = z.uuid().safeParse(formData.get("backupId"));
  if (!parsed.success) redirect("/admin/sistema?erro=Backup%20inv%C3%A1lido.");

  const [backup] = await getDb()
    .select()
    .from(backupRuns)
    .where(eq(backupRuns.id, parsed.data))
    .limit(1);
  if (!backup) redirect("/admin/sistema?erro=Backup%20n%C3%A3o%20encontrado.");

  const testedAt = new Date();
  await getDb()
    .update(backupRuns)
    .set({ restoreTestedAt: testedAt, restoreTestedBy: session.userId })
    .where(eq(backupRuns.id, backup.id));

  await auditPlatformAction({
    session,
    action: "backup.restore_tested",
    entityType: "backup_run",
    entityId: backup.id,
    after: { restoreTestedAt: testedAt.toISOString() },
  });

  revalidatePath("/admin/sistema");
  redirect("/admin/sistema?ok=Restore%20registrado.");
}
