"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { setIntegrationEnabled, type IntegrationKey } from "@/lib/integration-settings";

export async function toggleIntegration(key: IntegrationKey, enabled: boolean) {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan ændre integrationer");

  await setIntegrationEnabled(key, enabled);

  revalidatePath("/settings/dinero");
  revalidatePath("/settings/signwell");
}
