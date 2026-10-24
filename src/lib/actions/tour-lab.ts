"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { setSettingValue } from "@/lib/integration-settings";

/** Saves the Matterport SDK key (a public browser key, locked to our domains in Matterport). */
export async function saveMatterportSdkKey(key: string): Promise<void> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan ændre SDK-nøglen.");
  await setSettingValue("MATTERPORT_SDK_KEY", key.trim() || null);
  revalidatePath("/tour-lab");
}
