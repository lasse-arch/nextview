"use server";

import Papa from "papaparse";
import { addMonths, max as maxDate } from "date-fns";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { buildDealEmailAddress } from "@/lib/email-address";
import { findDuplicateDeals } from "@/lib/duplicates";
import { recalcCommission } from "@/lib/commission-service";
import { computeBillingPeriods, computePeriodAmounts } from "@/lib/invoice-schedule";
import { pick, parseAmount, type ParsedRow } from "@/lib/import-helpers";

/**
 * Imports customers who are already active/paying, or already under
 * contract but not started yet (not brand-new leads). A row with a start
 * date becomes a Live customer; every billing period that would already
 * be due is recorded as IMPORTED rather than drafted in Dinero, since
 * those were already invoiced by whatever system was used before this
 * CRM - only periods due from today onward will actually generate new
 * Dinero drafts going forward. A row without a start date (but with a
 * contract value + binding period) becomes a pipeline deal instead,
 * awaiting its start date like any other signed-but-not-live deal.
 */
export async function importExistingCustomers(formData: FormData) {
  const user = await requireUser();
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Vælg en CSV-fil.");
  }

  const text = await file.text();
  const parsed = Papa.parse<ParsedRow>(text, { header: true, skipEmptyLines: true });
  const rows = parsed.data;

  const users = await prisma.user.findMany();
  const usersByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));

  const batch = await prisma.importBatch.create({
    data: { importType: "CSV", fileName: file.name, importedById: user.id },
  });

  let created = 0;
  const duplicateNames: string[] = [];
  const skippedRows: string[] = [];

  for (const row of rows) {
    const companyName = pick(row, "companyName", "company", "firma", "firmanavn", "virksomhed");
    const saleAmountRaw = pick(row, "saleAmount", "salgsbeløb", "kontraktværdi", "beløb");
    const bindingMonthsRaw = pick(row, "bindingMonths", "binding", "bindingsperiode", "binding (mdr)");
    const startDateRaw = pick(row, "startDate", "startdato", "livedato", "kontraktstart", "kontrakt-start");

    if (!companyName || !saleAmountRaw || !bindingMonthsRaw) {
      if (companyName) skippedRows.push(companyName);
      continue;
    }

    const saleAmount = parseAmount(saleAmountRaw);
    const bindingMonths = parseInt(bindingMonthsRaw, 10);
    const startDate = startDateRaw ? new Date(startDateRaw) : null;
    if (saleAmount === null || !bindingMonths || (startDateRaw && isNaN(startDate!.getTime()))) {
      skippedRows.push(companyName);
      continue;
    }

    const cvrNumber = pick(row, "cvrNumber", "cvr", "cvrnr");
    const address = pick(row, "address", "adresse");
    const contactName = pick(row, "contactName", "contact", "navn", "kontaktperson");
    const contactEmail = pick(row, "contactEmail", "email", "e-mail");
    const contactPhone = pick(row, "contactPhone", "phone", "telefon", "tlf");
    const ownerEmail = pick(row, "ownerEmail", "owner", "ejer", "saelger", "sælger");
    const soldProduct = pick(row, "soldProduct", "produkt", "ydelse", "service");
    const establishmentFeeRaw = pick(row, "establishmentFee", "etableringspris", "opstart", "opstartspris");
    const establishmentFee = establishmentFeeRaw ? parseAmount(establishmentFeeRaw) : null;

    const owner = (ownerEmail && usersByEmail.get(ownerEmail.toLowerCase())) || users.find((u) => u.id === user.id) || users[0];

    const existingMatches = await findDuplicateDeals(companyName);
    if (existingMatches.length > 0) duplicateNames.push(companyName);

    const deal = await prisma.deal.create({
      data: {
        companyName,
        cvrNumber,
        address,
        contactName,
        contactEmail,
        contactPhone,
        ownerId: owner.id,
        importType: "CSV",
        importBatchId: batch.id,
        stage: startDate ? "LIVE" : "CONTRACT_SIGNED",
        soldProduct,
        saleAmount,
        bindingMonths,
        establishmentFee,
        soldAt: startDate,
        contractSignedAt: startDate,
        liveAt: startDate,
        billingStartDate: startDate,
      },
    });

    await prisma.deal.update({
      where: { id: deal.id },
      data: { dealEmailAddress: buildDealEmailAddress(deal.id) },
    });

    // Rows without a start date are still pipeline (signed but not live
    // yet) - nothing to bill until they get a start date, same as any
    // other signed deal.
    if (startDate) {
      // Mark historical periods (and the establishment fee, if the contract
      // already started in the past) as already handled by the old system.
      const now = new Date();
      if (establishmentFee && establishmentFee > 0 && startDate <= now) {
        await prisma.invoice.create({
          data: {
            dealId: deal.id,
            termNumber: 1,
            quarterIndex: 0,
            amount: establishmentFee,
            scheduledDate: startDate,
            status: "IMPORTED",
          },
        });
      }

      const until = maxDate([addMonths(startDate, bindingMonths), now]);
      const periods = computeBillingPeriods(startDate, bindingMonths, until);
      const amounts = computePeriodAmounts(saleAmount, periods, startDate, bindingMonths);
      for (let i = 0; i < periods.length; i++) {
        if (periods[i].draftTriggerDate > now) continue;
        await prisma.invoice.create({
          data: {
            dealId: deal.id,
            termNumber: 1,
            quarterIndex: periods[i].index,
            amount: amounts[i],
            scheduledDate: periods[i].startDate,
            status: "IMPORTED",
          },
        });
      }
    }

    await recalcCommission(deal.id);
    created++;
  }

  revalidatePath("/deals");
  revalidatePath("/commission");

  const params = new URLSearchParams({ importBatchId: batch.id });
  if (duplicateNames.length > 0) params.set("duplicates", duplicateNames.join(","));
  if (skippedRows.length > 0) params.set("skipped", skippedRows.join(","));
  redirect(`/deals?${params.toString()}`);
}
