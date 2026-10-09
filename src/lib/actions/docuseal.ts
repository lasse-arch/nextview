"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isDocuSealConfigured, createAndSendSubmission, cancelDocuSealSubmission } from "@/lib/docuseal";
import { lookupCvrNumber } from "@/lib/cvr";
import {
  buildContractHtmlData,
  computeMonthlyTotal,
  computeSetupTotal,
  PRODUCT_LABELS,
  CONTRACT_SIGNER,
  type ContractProducts,
} from "@/lib/contract-template-data";
import { buildContractHtml } from "@/lib/contract-html-template";
import { renderContractPdf } from "@/lib/contract-pdf-renderer";
import { completeContractFollowUpTasks, createContractFollowUpTask } from "@/lib/task-automation";
import { logActivity } from "@/lib/activity";
import { dealName, totalContractValue } from "@/lib/labels";
import { contactNameProblem } from "@/lib/contact-name";

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

  // Checks what's saved on the deal - a field typed in but not saved yet
  // doesn't count, hence the reminder.
  const saveHint = " (Husk at gemme dealen først.)";
  if (!deal.cvrNumber) return { ok: false, error: `Udfyld CVR-nummer før kontrakten kan sendes.${saveHint}` };
  const nameProblem = contactNameProblem(deal.contactName);
  if (nameProblem) return { ok: false, error: deal.contactName ? nameProblem : `${nameProblem}${saveHint}` };
  if (!deal.contactEmail) return { ok: false, error: `Udfyld kontaktpersonens e-mail før kontrakten kan sendes.${saveHint}` };
  if (!deal.contactPhone) return { ok: false, error: `Udfyld kontaktpersonens telefonnummer før kontrakten kan sendes.${saveHint}` };

  const cvrResult = await lookupCvrNumber(deal.cvrNumber);
  if (!cvrResult.ok) return { ok: false, error: `CVR-opslag fejlede: ${cvrResult.error}` };

  return { ok: true, cvrName: cvrResult.data.name };
}

/**
 * Renders the contract as HTML → PDF from exactly what was entered on the
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
    const sender = await requireUser();

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
    const nameProblem = contactNameProblem(deal.contactName);
    if (nameProblem || !deal.contactName) throw new Error(nameProblem ?? "Dealen mangler et kontaktpersonnavn.");
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

    const htmlData = buildContractHtmlData(
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

    const html = buildContractHtml(htmlData, products.language);
    const pdfBuffer = await renderContractPdf(html);

    const documentName = `Nextview360 x ${deal.displayName || deal.companyName}`;
    const submission = await createAndSendSubmission({
      fileName: `${documentName}.pdf`,
      fileBuffer: pdfBuffer,
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
        inLeadInbox: false,
        saleAmount: computeMonthlyTotal(products),
        establishmentFee: computeSetupTotal(products),
        bindingMonths: products.bindingMonths,
        noticePeriodMonths: products.noticeMonths,
        additionalTerms: products.additionalTerms || null,
        soldProduct: selectedKeys.map((key) => PRODUCT_LABELS[key]).join(", "),
        contractProducts: products,
      },
    });

    await prisma.contractEvent.create({ data: { dealId, type: "SENT", occurredAt: new Date() } });
    await createContractFollowUpTask(dealId, deal.ownerId, sender.id);
    await logActivity({
      type: "CONTRACT_SENT",
      message: `${sender.name} sendte en kontrakt til ${dealName(deal)}. ${contractSummary(products)}`,
      actorId: sender.id,
      dealId,
    });

    revalidatePath(`/deals/${dealId}`);
    revalidatePath("/opgaver");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Der opstod en fejl ved afsendelse af kontrakten." };
  }
}

/**
 * Archives an already-signed contract so a new one can be built and sent for
 * the same deal (the deal's sold terms - product, price, binding - stay
 * untouched until a replacement contract is actually sent and overwrites
 * them). Gated behind the admin typing "slet" as a lightweight confirmation,
 * since this can't be undone from the UI once done.
 */
export async function archiveSignedContract(
  dealId: string,
  confirmationText: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const user = await requireUser();
    if (user.role !== "ADMIN") {
      throw new Error("Kun admins kan arkivere en underskrevet kontrakt.");
    }
    if (confirmationText.trim().toLowerCase() !== "slet") {
      throw new Error('Skriv "slet" for at bekræfte arkivering.');
    }

    const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
    if (deal.contractStatus !== "SIGNED") {
      throw new Error("Kontrakten er ikke underskrevet og kan ikke arkiveres herfra.");
    }

    if (deal.docusealSubmissionId) {
      await cancelDocuSealSubmission(deal.docusealSubmissionId);
    }

    await prisma.deal.update({
      where: { id: dealId },
      data: {
        contractStatus: "VOIDED",
        docusealSubmissionId: null,
        contractSentAt: null,
        contractViewedAt: null,
        contractSignedAt: null,
      },
    });

    await prisma.contractEvent.create({ data: { dealId, type: "SIGNED_CONTRACT_ARCHIVED", occurredAt: new Date() } });

    revalidatePath(`/deals/${dealId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Der opstod en fejl ved arkivering af kontrakten." };
  }
}

/**
 * Withdraws a contract that's been sent but not signed yet: archived in
 * DocuSeal (the customer's signing link stops working) and taken off the
 * deal, so a new one can be sent. The deal goes back from "Kontrakt sendt"
 * to "Opfølgning", and the follow-up task for the contract is closed.
 * Same "slet" confirmation as archiving a signed one.
 */
export async function archiveSentContract(
  dealId: string,
  confirmationText: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireUser();
    if (confirmationText.trim().toLowerCase() !== "slet") {
      throw new Error('Skriv "slet" for at bekræfte.');
    }
    const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
    if (deal.contractStatus !== "SENT" && deal.contractStatus !== "VIEWED") {
      throw new Error("Der er ingen sendt, uunderskrevet kontrakt at slette.");
    }

    if (deal.docusealSubmissionId) {
      await cancelDocuSealSubmission(deal.docusealSubmissionId);
    }

    await prisma.deal.update({
      where: { id: dealId },
      data: {
        contractStatus: "VOIDED",
        docusealSubmissionId: null,
        contractSentAt: null,
        contractViewedAt: null,
        ...(deal.stage === "CONTRACT_SENT" ? { stage: "FOLLOW_UP" as const } : {}),
      },
    });
    await prisma.contractEvent.create({ data: { dealId, type: "SENT_CONTRACT_ARCHIVED", occurredAt: new Date() } });
    await completeContractFollowUpTasks(dealId);

    revalidatePath(`/deals/${dealId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Der opstod en fejl ved sletning af kontrakten." };
  }
}

/** "(Etablering: 10.000, MRR: 500, Binding: 12 måneder, Kontraktværdi: 16.000)" -
 * the feed's at-a-glance numbers for a sent contract. Kontraktværdi is the
 * whole contract: establishment + MRR × binding. */
function contractSummary(products: ContractProducts): string {
  const n = (v: number) => new Intl.NumberFormat("da-DK", { maximumFractionDigits: 0 }).format(v);
  const setup = computeSetupTotal(products);
  const mrr = computeMonthlyTotal(products);
  const value = setup + totalContractValue({ saleAmount: mrr, bindingMonths: products.bindingMonths });
  return `(Etablering: ${n(setup)}, MRR: ${n(mrr)}, Binding: ${products.bindingMonths} måneder, Kontraktværdi: ${n(value)})`;
}
