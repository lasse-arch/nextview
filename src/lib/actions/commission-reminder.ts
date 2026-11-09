"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

/** "Husk faktura for din provisionsperiode" closed by the seller - for this period only (it comes back when the next one starts). */
export async function hideCommissionReminder(periodStart: string): Promise<{ ok: boolean }> {
  const user = await requireUser();
  if (typeof periodStart !== "string" || !/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(periodStart)) return { ok: false };
  await prisma.user.update({ where: { id: user.id }, data: { commissionReminderHiddenFor: periodStart } });
  revalidatePath("/arpo");
  return { ok: true };
}
