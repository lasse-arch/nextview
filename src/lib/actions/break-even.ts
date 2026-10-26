"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { setSettingValue } from "@/lib/integration-settings";

/** The two numbers break-even on Provision is figured with: our cost per hour of work, and the running cost per customer per month. */
export async function saveBreakEvenSettings(hourlyRate: string, monthlyCost: string): Promise<{ error?: string }> {
  const user = await requireUser();
  if (user.role !== "ADMIN") return { error: "Kun admin kan ændre dette." };
  const rate = Math.round(Number(hourlyRate.replace(",", ".")) || 0);
  const monthly = Math.round(Number(monthlyCost.replace(",", ".")) || 0);
  if (rate < 0 || monthly < 0) return { error: "Tallene kan ikke være negative." };
  await setSettingValue("BREAKEVEN_HOURLY_RATE", String(rate));
  await setSettingValue("BREAKEVEN_MONTHLY_COST", String(monthly));
  revalidatePath("/commission");
  return {};
}
