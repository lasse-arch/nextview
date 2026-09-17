"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isSignWellConfigured, createAndSendSignatureRequest, ensureWebhookRegistered } from "@/lib/signwell";
import { buildContractTemplateData } from "@/lib/contract-template-data";
import { generateContractDocx } from "@/lib/contract-generator";

/**
 * Returns a result object rather than throwing - Next.js redacts thrown
 * Server Action error messages in production builds (the client only ever
 * sees "Minified React error #441"), so expected/validation failures must
 * come back as data for the UI to display them.
 */
export async function sendContractViaSignWell(dealId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireUser();

    if (!(await isSignWellConfigured())) {
      throw new Error("SignWell er ikke konfigureret eller er slået fra under Indstillinger.");
    }

    const deal = await prisma.deal.findUniqueOrThrow({
      where: { id: dealId },
      include: { owner: true, items: true },
    });

    if (!deal.contactEmail) {
      throw new Error("Dealen mangler en kontakt-e-mail. Udfyld den før kontrakten kan sendes.");
    }
    if (!deal.contactName) {
      throw new Error("Dealen mangler et kontaktpersonnavn. Udfyld det før kontrakten kan sendes.");
    }
    if (!deal.soldProduct && deal.items.length === 0) {
      throw new Error("Vælg mindst ét produkt (Solgt til, eller Ydelser & steder) før kontrakten sendes.");
    }
    if (!deal.bindingMonths) {
      throw new Error("Udfyld bindingsperiode (måneder) før kontrakten sendes.");
    }

    const templateData = buildContractTemplateData({
      companyName: deal.companyName,
      displayName: deal.displayName,
      cvrNumber: deal.cvrNumber,
      contactName: deal.contactName,
      contactEmail: deal.contactEmail,
      contactPhone: deal.contactPhone,
      address: deal.address,
      soldProduct: deal.soldProduct,
      saleAmount: deal.saleAmount,
      bindingMonths: deal.bindingMonths,
      establishmentFee: deal.establishmentFee,
      noticePeriodMonths: deal.noticePeriodMonths,
      items: deal.items,
      owner: { name: deal.owner.name, email: deal.owner.email, phone: deal.owner.phone },
    });

    const docxBuffer = generateContractDocx(templateData);

    const documentName = `Kontrakt - ${deal.companyName}`;
    const document = await createAndSendSignatureRequest({
      fileName: `${documentName}.docx`,
      fileBuffer: docxBuffer,
      documentName,
      recipients: [
        { id: "1", name: deal.owner.name, email: deal.owner.email },
        { id: "2", name: deal.contactName, email: deal.contactEmail },
      ],
      metadata: { dealId: deal.id },
    });

    await prisma.deal.update({
      where: { id: dealId },
      data: {
        signWellDocumentId: document.id,
        contractStatus: "SENT",
        contractSentAt: new Date(),
        stage: "CONTRACT_SENT",
      },
    });

    revalidatePath(`/deals/${dealId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Der opstod en fejl ved afsendelse af kontrakten." };
  }
}

export async function registerSignWellWebhook(): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requireUser();
  if (user.role !== "ADMIN") return { ok: false, error: "Kun admin kan registrere webhook." };

  const appBaseUrl = process.env.APP_BASE_URL || "http://localhost:3000";
  const callbackUrl = `${appBaseUrl}/api/integrations/signwell/webhook`;
  try {
    const id = await ensureWebhookRegistered(callbackUrl);
    if (!id) return { ok: false, error: "Kunne ikke registrere webhook hos SignWell." };
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Kunne ikke registrere webhook hos SignWell." };
  }
}
