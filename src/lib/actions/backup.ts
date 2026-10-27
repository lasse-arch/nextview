"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createBackup } from "@/lib/backup";

/** "Tag backup nu" on Health - the same as the nightly one. Admins only. */
export async function backupNow(): Promise<{ ok: true; size: number; tables: number; rows: number } | { ok: false; error: string }> {
  const user = await requireUser();
  if (user.role !== "ADMIN") return { ok: false, error: "Kun admin." };
  const r = await createBackup();
  revalidatePath("/arpo/health");
  return r.ok ? { ok: true, size: r.size, tables: r.tables, rows: r.rows } : { ok: false, error: r.error };
}
