"use server";

import Papa from "papaparse";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { pick, type ParsedRow } from "@/lib/import-helpers";

/** Hard cap on rows per file - a lead list, not a data dump. */
const MAX_IMPORT_ROWS = 5000;

/**
 * "Importér CSV" under Fundne leads - turns an uploaded list (e.g. every
 * højskole with phone/email/website) into its own named list of found
 * leads, reviewed exactly like a filter's: Tilføj til ringeliste, Tilføj
 * som deal or Afvis per row.
 *
 * Column names are matched loosely (case/spacing-insensitive, Danish or
 * English), and either ";" or "," works as separator. Only a name column is
 * required - a CVR column is used when present, but most such lists don't
 * have one. A row matching an existing deal (same CVR, or same name or
 * email when there's no CVR) is still listed, linked to that deal, so it
 * shows with the usual "findes allerede som deal" note instead of becoming
 * a second deal for the same company.
 */
export async function importLeadCsv(
  formData: FormData
): Promise<{ ok: true; imported: number; alreadyKnown: number; skipped: number } | { ok: false; error: string }> {
  const user = await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Vælg en CSV-fil." };

  const text = (await file.text()).replace(/^﻿/, "");
  const parsed = Papa.parse<ParsedRow>(text, { header: true, skipEmptyLines: "greedy" });
  if (parsed.data.length === 0) return { ok: false, error: "Filen indeholder ingen rækker." };
  if (parsed.data.length > MAX_IMPORT_ROWS) {
    return { ok: false, error: `Filen har for mange rækker (max ${MAX_IMPORT_ROWS}).` };
  }

  type Row = {
    companyName: string;
    cvrNumber: string | null;
    address: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
    website: string | null;
  };
  const rows: Row[] = [];
  const seenNames = new Set<string>();
  let skipped = 0;
  for (const raw of parsed.data) {
    const companyName = pick(raw, "Navn", "Firmanavn", "Firma", "Virksomhed", "Virksomhedsnavn", "Name", "Company");
    if (!companyName || seenNames.has(companyName.toLowerCase())) {
      skipped++;
      continue;
    }
    seenNames.add(companyName.toLowerCase());

    const cvrDigits = (pick(raw, "CVR", "CVR-nummer", "CVR nr", "CVRnr") ?? "").replace(/\D/g, "");
    const street = pick(raw, "Adresse", "Vejnavn", "Address");
    const postalCode = pick(raw, "Postnr", "Postnummer", "Post nr", "Zip", "Postal code");
    const city = pick(raw, "By", "Postdistrikt", "City");
    const country = pick(raw, "Land", "Country");
    const cityLine = [postalCode, city].filter(Boolean).join(" ");
    const address =
      [street, cityLine, country && country.toLowerCase() !== "danmark" ? country : null].filter(Boolean).join(", ") ||
      null;

    rows.push({
      companyName,
      cvrNumber: cvrDigits.length === 8 ? cvrDigits : null,
      address,
      contactPhone: pick(raw, "Telefon", "Tlf", "Tlf.", "Telefonnummer", "Mobil", "Phone"),
      contactEmail: pick(raw, "Email", "E-mail", "Mail", "E-mailadresse"),
      website: pick(raw, "Hjemmeside", "Website", "Web", "URL", "Webside"),
    });
  }
  if (rows.length === 0) return { ok: false, error: 'Ingen rækker med et navn - filen skal have en "Navn"-kolonne.' };

  // A CVR number is globally unique among found leads - a row whose CVR is
  // already some other list's lead is left out rather than failing the file.
  const cvrs = rows.map((r) => r.cvrNumber).filter((c): c is string => Boolean(c));
  const takenCvrs = new Set(
    cvrs.length > 0
      ? (await prisma.leadCandidate.findMany({ where: { cvrNumber: { in: cvrs } }, select: { cvrNumber: true } })).map(
          (c) => c.cvrNumber
        )
      : []
  );
  const fresh = rows.filter((r) => !(r.cvrNumber && takenCvrs.has(r.cvrNumber)));
  skipped += rows.length - fresh.length;

  const deals = await prisma.deal.findMany({
    where: {
      OR: [
        { cvrNumber: { in: cvrs } },
        { companyName: { in: fresh.map((r) => r.companyName), mode: "insensitive" } },
        { contactEmail: { in: fresh.map((r) => r.contactEmail).filter((e): e is string => Boolean(e)), mode: "insensitive" } },
      ],
    },
    select: { id: true, cvrNumber: true, companyName: true, contactEmail: true },
  });
  const dealFor = (r: Row) =>
    deals.find(
      (d) =>
        (r.cvrNumber && d.cvrNumber === r.cvrNumber) ||
        (!r.cvrNumber && d.companyName.toLowerCase() === r.companyName.toLowerCase()) ||
        (!r.cvrNumber && r.contactEmail && d.contactEmail?.toLowerCase() === r.contactEmail.toLowerCase())
    );

  const name =
    String(formData.get("name") || "").trim() || file.name.replace(/\.[^.]+$/, "").trim() || "Importeret liste";
  const list = await prisma.leadImportList.create({ data: { name, createdById: user.id } });
  let alreadyKnown = 0;
  await prisma.leadCandidate.createMany({
    data: fresh.map((r) => {
      const deal = dealFor(r);
      if (deal) alreadyKnown++;
      return { ...r, importListId: list.id, dealId: deal?.id ?? null };
    }),
    skipDuplicates: true,
  });

  revalidatePath("/leadgeneration");
  return { ok: true, imported: fresh.length, alreadyKnown, skipped };
}

export async function renameLeadImportList(
  listId: string,
  name: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireUser();
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Giv listen et navn." };
  await prisma.leadImportList.update({ where: { id: listId }, data: { name: trimmed } });
  revalidatePath("/leadgeneration");
  return { ok: true };
}
