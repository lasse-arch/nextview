"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isDocuSealConfigured, createAndSendSubmission } from "@/lib/docuseal";
import { lookupCvrNumber } from "@/lib/cvr";
import { recalcCommission } from "@/lib/commission-service";
import { sendContractSignedNotification } from "@/lib/notification-service";
import { createDeliveryTasksForSignedContract } from "@/lib/task-automation";
import {
  buildContractHtmlData,
  computeMonthlyTotal,
  computeSetupTotal,
  contractProductsToDealItems,
  PRODUCT_LABELS,
  CONTRACT_SIGNER,
  type ContractProducts,
} from "@/lib/contract-template-data";
import { buildContractHtml } from "@/lib/contract-html-template";
import { renderContractPdf } from "@/lib/contract-pdf-renderer";

export type StandaloneContractCustomer = {
  companyName: string;
  displayName: string;
  cvrNumber: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
};

/**
 * Sends a contract to a signer who doesn't have a Deal yet (e.g. someone
 * signed on the spot at an event, before there was time to create one). The
 * resulting StandaloneContract is a holding area - see
 * linkStandaloneContractToDeal below for pulling its data onto a real Deal
 * once one exists.
 */
export async function sendStandaloneContract(
  customer: StandaloneContractCustomer,
  products: ContractProducts
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const user = await requireUser();

    if (!(await isDocuSealConfigured())) {
      throw new Error("DocuSeal er ikke konfigureret eller er slået fra under Indstillinger.");
    }
    if (!customer.companyName.trim()) throw new Error("Udfyld firmanavn.");
    if (!customer.cvrNumber.trim()) throw new Error("Udfyld CVR-nummer.");
    if (!customer.contactName.trim()) throw new Error("Udfyld kontaktperson.");
    if (!customer.contactEmail.trim()) throw new Error("Udfyld kontakt-e-mail.");
    if (!customer.contactPhone.trim()) throw new Error("Udfyld telefonnummer.");

    const cvrResult = await lookupCvrNumber(customer.cvrNumber);
    if (!cvrResult.ok) throw new Error(`CVR-opslag fejlede: ${cvrResult.error}`);

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

    const sellerFullName = [user.name, user.lastName].filter(Boolean).join(" ");
    const htmlData = buildContractHtmlData(
      {
        companyName: customer.companyName,
        displayName: customer.displayName || null,
        cvrNumber: customer.cvrNumber,
        contactName: customer.contactName,
        contactEmail: customer.contactEmail,
        contactPhone: customer.contactPhone,
        address: customer.address || null,
        owner: { name: sellerFullName, email: user.email, phone: user.phone },
      },
      products
    );

    const html = buildContractHtml(htmlData, products.language);
    const pdfBuffer = await renderContractPdf(html);

    const documentName = `Nextview360 x ${customer.displayName || customer.companyName}`;
    const submission = await createAndSendSubmission({
      fileName: `${documentName}.pdf`,
      fileBuffer: pdfBuffer,
      documentName,
      submitters: [
        { role: "Company", name: CONTRACT_SIGNER.name, email: CONTRACT_SIGNER.email, externalId: "director" },
        { role: "Customer", name: customer.contactName, email: customer.contactEmail, externalId: "customer" },
      ],
      metadata: { standalone: "true" },
    });

    const created = await prisma.standaloneContract.create({
      data: {
        companyName: customer.companyName,
        displayName: customer.displayName || null,
        cvrNumber: customer.cvrNumber,
        contactName: customer.contactName,
        contactEmail: customer.contactEmail,
        contactPhone: customer.contactPhone,
        address: customer.address || null,
        docusealSubmissionId: String(submission.id),
        contractStatus: "SENT",
        contractSentAt: new Date(),
        saleAmount: computeMonthlyTotal(products),
        establishmentFee: computeSetupTotal(products),
        bindingMonths: products.bindingMonths,
        noticePeriodMonths: products.noticeMonths,
        additionalTerms: products.additionalTerms || null,
        soldProduct: selectedKeys.map((key) => PRODUCT_LABELS[key]).join(", "),
        contractProducts: products,
        language: products.language,
        createdById: user.id,
      },
    });

    revalidatePath("/settings/docuseal/standalone-contracts");
    return { ok: true, id: created.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Der opstod en fejl ved afsendelse af kontrakten." };
  }
}

export async function deleteStandaloneContract(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireUser();
    await prisma.standaloneContract.delete({ where: { id } });
    revalidatePath("/settings/docuseal/standalone-contracts");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Kunne ikke slette kontrakten." };
  }
}

/**
 * Copies a standalone contract's data onto an existing deal - identity/contact
 * fields only fill in what the deal doesn't already have, but everything
 * about the contract itself (product, price, binding, status, dates) always
 * comes from the contract, since that's the actual signed agreement. If the
 * contract was already signed, this also runs the same side effects the
 * signing webhook would have (deal items, commission, notification), since
 * those never had a deal to attach to until now.
 */
export async function linkStandaloneContractToDeal(
  contractId: string,
  dealId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireUser();

    const [contract, deal] = await Promise.all([
      prisma.standaloneContract.findUniqueOrThrow({ where: { id: contractId } }),
      prisma.deal.findUniqueOrThrow({ where: { id: dealId } }),
    ]);

    if (deal.contractStatus !== "NONE") {
      throw new Error(
        "Dealen har allerede en kontrakt i gang. Arkivér/annullér den eksisterende kontrakt på dealen først."
      );
    }

    const stageForStatus: Record<string, typeof deal.stage | undefined> = {
      SENT: "CONTRACT_SENT",
      VIEWED: "CONTRACT_SENT",
      SIGNED: "CONTRACT_SIGNED",
    };
    const newStage = stageForStatus[contract.contractStatus] ?? deal.stage;

    await prisma.deal.update({
      where: { id: dealId },
      data: {
        cvrNumber: deal.cvrNumber ?? contract.cvrNumber,
        contactName: deal.contactName ?? contract.contactName,
        contactEmail: deal.contactEmail ?? contract.contactEmail,
        contactPhone: deal.contactPhone ?? contract.contactPhone,
        address: deal.address ?? contract.address,
        docusealSubmissionId: contract.docusealSubmissionId,
        contractStatus: contract.contractStatus,
        contractSentAt: contract.contractSentAt,
        contractViewedAt: contract.contractViewedAt,
        contractSignedAt: contract.contractSignedAt,
        soldAt: contract.contractStatus === "SIGNED" ? deal.soldAt ?? contract.contractSignedAt : deal.soldAt,
        soldProduct: contract.soldProduct,
        bindingMonths: contract.bindingMonths,
        saleAmount: contract.saleAmount,
        establishmentFee: contract.establishmentFee,
        noticePeriodMonths: contract.noticePeriodMonths,
        additionalTerms: contract.additionalTerms,
        contractProducts: contract.contractProducts ?? undefined,
        stage: newStage,
      },
    });

    if (contract.contractStatus === "SIGNED" && contract.contractProducts) {
      const products = contract.contractProducts as unknown as ContractProducts;
      const items = contractProductsToDealItems(products);
      if (items.length > 0) {
        await prisma.dealItem.createMany({ data: items.map((item) => ({ ...item, dealId })) });
      }
      await recalcCommission(dealId);
      await sendContractSignedNotification(dealId);
      await createDeliveryTasksForSignedContract(dealId, deal.ownerId, products);
    }

    await prisma.standaloneContract.delete({ where: { id: contractId } });

    revalidatePath("/settings/docuseal/standalone-contracts");
    revalidatePath(`/deals/${dealId}`);
    revalidatePath("/deals");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Kunne ikke kæde kontrakten sammen med dealen." };
  }
}
