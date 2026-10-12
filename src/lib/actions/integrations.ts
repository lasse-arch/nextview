"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { setIntegrationEnabled, type IntegrationKey } from "@/lib/integration-settings";
import { prisma } from "@/lib/db";
import { REQUIRE_GOOGLE_LOGIN_KEY } from "@/lib/google-login";

export async function toggleIntegration(key: IntegrationKey, enabled: boolean) {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan ændre integrationer");

  await setIntegrationEnabled(key, enabled);

  revalidatePath("/settings/dinero");
  revalidatePath("/settings/docuseal");
  revalidatePath("/settings/email");
}

/**
 * "Kræv Google-login" on Brugere. Only turned on by an admin who has logged
 * in with Google themselves - proof that Google login works, so turning off
 * passwords can't lock everyone out.
 */
export async function setRequireGoogleLogin(enabled: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  if (user.role !== "ADMIN") return { ok: false, error: "Kun admin kan ændre login-indstillinger." };
  if (enabled && !user.lastGoogleLoginAt) {
    return { ok: false, error: "Log selv ind med Google først - så ved vi, at det virker, før adgangskoder slås fra." };
  }
  await prisma.integrationSetting.upsert({
    where: { key: REQUIRE_GOOGLE_LOGIN_KEY },
    create: { key: REQUIRE_GOOGLE_LOGIN_KEY, enabled },
    update: { enabled },
  });
  revalidatePath("/users");
  return { ok: true };
}
