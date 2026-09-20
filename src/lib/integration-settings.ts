import { prisma } from "@/lib/db";

export type IntegrationKey =
  | "DINERO"
  | "DOCUSEAL"
  | "GOOGLE_DRIVE"
  | "DINERO_TEST_MODE"
  | "DINERO_AUTO_RUN"
  | "CUSTOMER_REPORTS_AUTO_RUN";

export const integrationLabels: Record<IntegrationKey, string> = {
  DINERO: "Dinero",
  DOCUSEAL: "DocuSeal",
  GOOGLE_DRIVE: "Google Drev",
  DINERO_TEST_MODE: "Dinero – testtilstand",
  DINERO_AUTO_RUN: "Dinero – automatisk daglig kørsel",
  CUSTOMER_REPORTS_AUTO_RUN: "Besøgsrapporter – automatisk afsendelse",
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

/**
 * Off by default (unlike isIntegrationEnabled's default-on) - a fresh
 * install should never silently stop creating real invoice drafts just
 * because nobody's touched this setting yet.
 */
export async function isDineroTestMode(): Promise<boolean> {
  const setting = await prisma.integrationSetting.findUnique({ where: { key: "DINERO_TEST_MODE" } });
  return setting?.enabled ?? false;
}
