"use server";

import Papa from "papaparse";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { buildDealEmailAddress } from "@/lib/email-address";
import { findDuplicateDeals } from "@/lib/duplicates";
import type { ImportType, DealStage, User } from "@prisma/client";

import { pick, parseAmount, type ParsedRow } from "@/lib/import-helpers";

/** Maps a free-text status/stage cell (Danish or English) onto our pipeline stages. */
function mapStatusToStage(raw: string): DealStage {
  const s = raw.trim().toLowerCase();
  if (["won", "vundet", "solgt", "signed", "kontrakt underskrevet"].includes(s)) return "CONTRACT_SIGNED";
  if (["lost", "tabt"].includes(s)) return "LOST";
  if (["contacted", "kontaktet"].includes(s)) return "CONTACTED";
  if (["meeting booked", "møde booket", "mødebooket", "møde booked"].includes(s)) return "MEETING_BOOKED";
  if (["contract sent", "kontrakt sendt", "tilbud sendt"].includes(s)) return "CONTRACT_SENT";
  if (["filmed", "filmet"].includes(s)) return "FILMED";
  if (["live"].includes(s)) return "LIVE";
  return "LEAD";
}

/** Matches an owner column value against a user by email, full name, or first name. */
function matchOwner(raw: string | null, users: User[]): User | null {
  if (!raw) return null;
  const needle = raw.trim().toLowerCase();
  return (
    users.find((u) => u.email.toLowerCase() === needle) ||
    users.find((u) => u.name.toLowerCase() === needle) ||
    users.find((u) => u.name.toLowerCase().split(" ")[0] === needle) ||
    null
  );
}

async function createDealsFromRows(
  rows: ParsedRow[],
  importType: ImportType,
  meta: { fileName?: string; sourceUrl?: string },
  importerId: string
) {
  const users = await prisma.user.findMany();

  const batch = await prisma.importBatch.create({
    data: {
      importType,
      fileName: meta.fileName,
      sourceUrl: meta.sourceUrl,
      importedById: importerId,
    },
  });

  let created = 0;
  const duplicateNames: string[] = [];

  for (const row of rows) {
    const companyName = pick(row, "companyName", "company", "firma", "firmanavn", "virksomhed", "navn");
    if (!companyName) continue;

    const cvrNumber = pick(row, "cvrNumber", "cvr", "cvrnr");
    const address = pick(row, "address", "adresse");
    const contactName = pick(row, "contactName", "contact", "kontaktperson");
    const contactEmail = pick(row, "contactEmail", "email", "e-mail", "mail");
    const contactPhone = pick(row, "contactPhone", "phone", "telefon", "tlf", "nummer");
    const ownerRaw = pick(row, "ownerEmail", "owner", "ejer", "saelger", "sælger", "sales rep", "salesrep");
    const soldProduct = pick(row, "soldProduct", "produkt", "ydelse", "service", "salgtype");
    const saleAmountRaw = pick(row, "saleAmount", "salgsbeløb", "månedligt beløb", "beløb", "potentiel mrr", "mrr");
    const saleAmount = saleAmountRaw ? parseAmount(saleAmountRaw) : null;
    const establishmentFeeRaw = pick(row, "establishmentFee", "etableringspris", "opstart", "opstartspris", "oprettelse");
    const establishmentFee = establishmentFeeRaw ? parseAmount(establishmentFeeRaw) : null;
    const bindingMonthsRaw = pick(row, "bindingMonths", "binding", "bindingsperiode", "binding (mdr)");
    const bindingMonths = bindingMonthsRaw ? parseInt(bindingMonthsRaw, 10) || null : null;
    const statusRaw = pick(row, "status", "stadie", "stage");
    const stage: DealStage = statusRaw ? mapStatusToStage(statusRaw) : "LEAD";
    const provisionRaw = pick(row, "provision", "commission");
    const provision = provisionRaw ? parseAmount(provisionRaw) : null;
    const lastTouchRaw = pick(row, "sidste touch (dato)", "sidste touch", "sidste kontakt", "last touch");
    const noteText = pick(row, "noter", "note", "notes", "kommentar");

    const owner = matchOwner(ownerRaw, users) || users.find((u) => u.id === importerId) || users[0];

    const existingMatches = await findDuplicateDeals(companyName);
    if (existingMatches.length > 0) {
      duplicateNames.push(companyName);
    }

    const deal = await prisma.deal.create({
      data: {
        companyName,
        cvrNumber,
        address,
        contactName,
        contactEmail,
        contactPhone,
        ownerId: owner.id,
        importType,
        importBatchId: batch.id,
        stage,
        soldProduct,
        saleAmount,
        establishmentFee,
        bindingMonths,
      },
    });

    await prisma.deal.update({
      where: { id: deal.id },
      data: { dealEmailAddress: buildDealEmailAddress(deal.id) },
    });

    if (noteText || lastTouchRaw) {
      const body = lastTouchRaw ? `Sidste touch (${lastTouchRaw}): ${noteText ?? ""}`.trim() : noteText!;
      await prisma.note.create({
        data: { dealId: deal.id, authorId: owner.id, kind: "MANUAL", body },
      });
    }

    // The imported "provision" is a flat historical commission from the old
    // system, unrelated to our rate-based engine - stored as-is rather than
    // run through recalcCommission, which would replace it with a computed
    // amount based on the seller's current commission rate.
    if (provision !== null) {
      await prisma.commission.create({
        data: {
          dealId: deal.id,
          sellerId: owner.id,
          rate: 0,
          baseAmount: saleAmount ?? 0,
          amount: provision,
          frequency: owner.payoutFrequency,
        },
      });
    }

    created++;
  }

  return { batchId: batch.id, created, duplicateNames };
}

function buildImportRedirectUrl(batchId: string, duplicateNames: string[]): string {
  const params = new URLSearchParams({ importBatchId: batchId });
  if (duplicateNames.length > 0) {
    params.set("duplicates", duplicateNames.join(","));
  }
  return `/deals?${params.toString()}`;
}

export async function importFromCsvFile(formData: FormData) {
  const user = await requireUser();
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return;
  }

  const text = await file.text();
  const parsed = Papa.parse<ParsedRow>(text, { header: true, skipEmptyLines: true });
  const rows = parsed.data;

  const { batchId, duplicateNames } = await createDealsFromRows(rows, "CSV", { fileName: file.name }, user.id);

  revalidatePath("/deals");
  redirect(buildImportRedirectUrl(batchId, duplicateNames));
}

export async function importFromGoogleDocs(formData: FormData) {
  const user = await requireUser();
  const sourceUrl = String(formData.get("sourceUrl") || "").trim();
  const pastedText = String(formData.get("pastedText") || "").trim();

  let csvText = pastedText;

  if (!csvText && sourceUrl) {
    const res = await fetch(sourceUrl);
    if (!res.ok) {
      throw new Error("Kunne ikke hente dokumentet. Sørg for at det er delt/publiceret offentligt.");
    }
    csvText = await res.text();
  }

  if (!csvText) {
    throw new Error("Angiv enten en URL eller indsæt tekst/tabel.");
  }

  const parsed = Papa.parse<ParsedRow>(csvText, { header: true, skipEmptyLines: true });
  const rows = parsed.data;

  const { batchId, duplicateNames } = await createDealsFromRows(
    rows,
    "GOOGLE_DOCS",
    { sourceUrl: sourceUrl || undefined },
    user.id
  );

  revalidatePath("/deals");
  redirect(buildImportRedirectUrl(batchId, duplicateNames));
}

/** Removes an import batch that didn't actually create any deals (e.g. an empty/failed file). */
export async function deleteEmptyImportBatch(batchId: string) {
  await requireUser();
  const dealCount = await prisma.deal.count({ where: { importBatchId: batchId } });
  if (dealCount > 0) {
    throw new Error("Denne import har importeret deals og kan ikke slettes herfra.");
  }
  await prisma.importBatch.delete({ where: { id: batchId } });
  revalidatePath("/deals");
}
