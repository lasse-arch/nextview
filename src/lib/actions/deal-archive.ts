"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { restoreDeletedDeal } from "@/lib/deal-archive";

/** "Gendan" in Slettede kunder - admins only. */
export async function restoreDeal(id: string) {
  const user = await requireUser();
  if (user.role !== "ADMIN") return { ok: false as const, error: "Kun admin kan sætte kunder tilbage." };
  const result = await restoreDeletedDeal(id);
  if (result.ok) {
    revalidatePath("/deals");
    revalidatePath("/deals/slettede");
  }
  return result;
}
