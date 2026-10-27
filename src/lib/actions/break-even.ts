"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { setSettingValue } from "@/lib/integration-settings";

/** The running cost per customer per month, which break-even on Provision is figured with. */
export async function saveBreakEvenSettings(monthlyCost: string): Promise<{ error?: string }> {
  const user = await requireUser();
  if (user.role !== "ADMIN") return { error: "Kun admin kan ændre dette." };
  const monthly = Math.round(Number(monthlyCost.replace(",", ".")) || 0);
  if (monthly < 0) return { error: "Driften kan ikke være negativ." };
  await setSettingValue("BREAKEVEN_MONTHLY_COST", String(monthly));
  revalidatePath("/arpo/commission");
  return {};
}
