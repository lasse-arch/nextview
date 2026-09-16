"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { createDocumentFromDeal, sendDocument, waitForDocumentDraftReady, isPandaDocConfigured } from "@/lib/pandadoc";

export async function sendContract(dealId: string) {
  await requireUser();

  if (!(await isPandaDocConfigured())) {
    throw new Error("PandaDoc er ikke konfigureret eller er slået fra under Indstillinger.");
  }

  const deal = await prisma.deal.findUniqueOrThrow({
    where: { id: dealId },
    include: { owner: true },
  });

  if (!deal.contactEmail) {
    throw new Error("Dealen mangler en kontakt-e-mail. Udfyld den før kontrakten kan sendes.");
  }
  if (!deal.soldProduct || !deal.saleAmount) {
    throw new Error("Udfyld 'Solgt til' og 'Salgsbeløb' før kontrakten sendes.");
  }

  const doc = await createDocumentFromDeal(
    {
      companyName: deal.companyName,
      contactName: deal.contactName,
      contactEmail: deal.contactEmail,
      soldProduct: deal.soldProduct,
      bindingMonths: deal.bindingMonths,
      saleAmount: deal.saleAmount,
      owner: { name: deal.owner.name, email: deal.owner.email },
    },
    `Kontrakt - ${deal.companyName}`
  );

  const readyStatus = await waitForDocumentDraftReady(doc.id);
  if (readyStatus === "document.error") {
    throw new Error("PandaDoc kunne ikke behandle dokumentet (tjek at template-tokens matcher).");
  }

  await sendDocument(doc.id);

  await prisma.deal.update({
    where: { id: dealId },
    data: {
      pandaDocDocumentId: doc.id,
      contractStatus: "SENT",
      contractSentAt: new Date(),
      stage: "CONTRACT_SENT",
    },
  });

  revalidatePath(`/deals/${dealId}`);
}
