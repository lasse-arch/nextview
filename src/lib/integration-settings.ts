import { prisma } from "@/lib/db";

export type IntegrationKey = "DINERO" | "PANDADOC";

export const integrationLabels: Record<IntegrationKey, string> = {
  DINERO: "Dinero",
  PANDADOC: "PandaDoc",
};

/** No row yet means the integration has never been explicitly turned off. */
export async function isIntegrationEnabled(key: IntegrationKey): Promise<boolean> {
  const setting = await prisma.integrationSetting.findUnique({ where: { key } });
  return setting?.enabled ?? true;
}

export async function setIntegrationEnabled(key: IntegrationKey, enabled: boolean): Promise<void> {
  await prisma.integrationSetting.upsert({
    where: { key },
    create: { key, enabled },
    update: { enabled },
  });
}
