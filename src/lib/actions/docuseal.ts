"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isDocuSealConfigured, createAndSendSubmission, cancelDocuSealSubmission } from "@/lib/docuseal";
import { lookupCvrNumber } from "@/lib/cvr";
import { buildContractTemplateData, computeMonthlyTotal, computeSetupTotal, type ContractProducts } from "@/lib/contract-template-data";
import { generateContractDocx } from "@/lib/contract-generator";

const PRODUCT_LABELS: Record<keyof Pick<ContractProducts, "nextviewTour" | "hjemmeside" | "droneOptagelse" | "visitkort">, string> = {
  nextviewTour: "Nextview360 Tour",
  hjemmeside: "Hjemmeside",
  droneOptagelse: "Drone-optagelse",
  visitkort: "Visitkort",
};

/**
 * Only one person ever signs on our side, regardless of which seller owns
 * the deal - the director, not the salesperson (see the contract template's
 * "For leverandør" signature block, which prints this same fixed name).
 */
const CONTRACT_SIGNER = { name: "Lasse Larsen", email: "info@nextview360.dk" };

/**
 * Pre-flight check before opening the contract-builder page: the master
 * data has to be complete and the CVR number has to actually resolve to a
 * real company, so the confirmation step can show its verified name.
 */
export async function checkDealReadyForContract(
  dealId: string
): Promise<{ ok: true; cvrName: string } | { ok: false; error: string }> {
  await requireUser();
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });

  if (!deal.cvrNumber) return { ok: false, error: "Udfyld CVR-nummer før kontrakten kan sendes." };
  if (!deal.contactName) return { ok: false, error: "Udfyld kontaktperson før kontrakten kan sendes." };
  if (!deal.contactEmail) return { ok: false, error: "Udfyld kontaktpersonens e-mail før kontrakten kan sendes." };
  if (!deal.contactPhone) return { ok: false, error: "Udfyld kontaktpersonens telefonnummer før kontrakten kan sendes." };

  const cvrResult = await lookupCvrNumber(deal.cvrNumber);
  if (!cvrResult.ok) return { ok: false, error: `CVR-opslag fejlede: ${cvrResult.error}` };

  return { ok: true, cvrName: cvrResult.data.name };
}

/**
 * Builds the contract docx from exactly what was entered on the
 * contract-builder page, sends it via DocuSeal, and freezes the resulting
 * totals/binding/terms onto the deal (contract is the source of truth for
 * those fields from here on - see LockedContractFields). If a previous,
 * still-unsigned contract exists for this deal, it's canceled first so the
 * customer can't accidentally sign the stale one.
 */
export async function buildAndSendContract(
  dealId: string,
  products: ContractProducts
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireUser();

    if (!(await isDocuSealConfigured())) {
      throw new Error("DocuSeal er ikke konfigureret eller er slået fra under Indstillinger.");
    }

    const deal = await prisma.deal.findUniqueOrThrow({
      where: { id: dealId },
      include: { owner: true },
    });

    if (deal.contractStatus === "SIGNED") {
      throw new Error("Kontrakten er allerede underskrevet og kan ikke ændres herfra.");
    }
    if (!deal.cvrNumber) throw new Error("Udfyld CVR-nummer før kontrakten kan sendes.");
    if (!deal.contactName) throw new Error("Dealen mangler et kontaktpersonnavn.");
    if (!deal.contactEmail) throw new Error("Dealen mangler en kontakt-e-mail.");
    if (!deal.contactPhone) throw new Error("Dealen mangler et telefonnummer.");

    const selectedKeys = (Object.keys(PRODUCT_LABELS) as (keyof typeof PRODUCT_LABELS)[]).filter(
      (key) => products[key].selected
    );
    if (selectedKeys.length === 0) throw new Error("Vælg mindst ét produkt.");
    if (!products.bindingMonths || products.bindingMonths <= 0) {
      throw new Error("Angiv en gyldig bindingsperiode.");
    }
    if (!products.noticeMonths || products.noticeMonths <= 0) {
      throw new Error("Angiv et gyldigt opsigelsesvarsel.");
    }

    if (deal.docusealSubmissionId && deal.contractStatus !== "NONE") {
      await cancelDocuSealSubmission(deal.docusealSubmissionId);
    }

    const sellerFullName = [deal.owner.name, deal.owner.lastName].filter(Boolean).join(" ");

    const templateData = buildContractTemplateData(
      {
        companyName: deal.companyName,
        displayName: deal.displayName,
        cvrNumber: deal.cvrNumber,
        contactName: deal.contactName,
        contactEmail: deal.contactEmail,
        contactPhone: deal.contactPhone,
        address: deal.address,
        owner: { name: sellerFullName, email: deal.owner.email, phone: deal.owner.phone },
      },
      products
    );

    const docxBuffer = generateContractDocx(templateData);

    const documentName = `Nextview360 x ${deal.displayName || deal.companyName}`;
    const submission = await createAndSendSubmission({
      fileName: `${documentName}.docx`,
      fileBuffer: docxBuffer,
      documentName,
      submitters: [
        { role: "Company", name: CONTRACT_SIGNER.name, email: CONTRACT_SIGNER.email, externalId: "director" },
        { role: "Customer", name: deal.contactName, email: deal.contactEmail, externalId: "customer" },
      ],
      metadata: { dealId: deal.id },
    });

    await prisma.deal.update({
      where: { id: dealId },
      data: {
        docusealSubmissionId: String(submission.id),
        contractStatus: "SENT",
        contractSentAt: new Date(),
        contractViewedAt: null,
        contractSignedAt: null,
        stage: "CONTRACT_SENT",
        saleAmount: computeMonthlyTotal(products),
        establishmentFee: computeSetupTotal(products),
        bindingMonths: products.bindingMonths,
        noticePeriodMonths: products.noticeMonths,
        additionalTerms: products.additionalTerms || null,
        soldProduct: selectedKeys.map((key) => PRODUCT_LABELS[key]).join(", "),
        contractProducts: products,
      },
    });

    revalidatePath(`/deals/${dealId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Der opstod en fejl ved afsendelse af kontrakten." };
  }
}
