"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { INDUSTRIES } from "@/lib/industries";

/** Sets a customer's industry (for sorting in "Online kunder"). Admins only; "" = back to the guess. */
export async function setDealIndustry(dealId: string, industry: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  if (user.role !== "ADMIN") return { ok: false, error: "Kun admin kan ændre branchen." };
  if (industry && !(INDUSTRIES as readonly string[]).includes(industry)) return { ok: false, error: "Ukendt branche." };
  await prisma.deal.update({ where: { id: dealId }, data: { industry: industry || null } });
  revalidatePath("/arpo/online-kunder");
  return { ok: true };
}
