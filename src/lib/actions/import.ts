"use server";

import Papa from "papaparse";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { buildDealEmailAddress } from "@/lib/email-address";
import { findDuplicateDeals } from "@/lib/duplicates";
import type { ImportType } from "@prisma/client";

import { pick, type ParsedRow } from "@/lib/import-helpers";

async function createDealsFromRows(
  rows: ParsedRow[],
  importType: ImportType,
  meta: { fileName?: string; sourceUrl?: string },
  importerId: string
) {
  const users = await prisma.user.findMany();
  const usersByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));

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
    const companyName = pick(row, "companyName", "company", "firma", "firmanavn", "virksomhed");
    if (!companyName) continue;

    const cvrNumber = pick(row, "cvrNumber", "cvr", "cvrnr");
    const address = pick(row, "address", "adresse");
    const contactName = pick(row, "contactName", "contact", "navn", "kontaktperson");
    const contactEmail = pick(row, "contactEmail", "email", "e-mail");
    const contactPhone = pick(row, "contactPhone", "phone", "telefon", "tlf");
    const ownerEmail = pick(row, "ownerEmail", "owner", "ejer", "saelger", "sælger");

    const owner = (ownerEmail && usersByEmail.get(ownerEmail.toLowerCase())) || users.find((u) => u.id === importerId) || users[0];

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
      },
    });

    await prisma.deal.update({
      where: { id: deal.id },
      data: { dealEmailAddress: buildDealEmailAddress(deal.id) },
    });

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
