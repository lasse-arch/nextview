import { addMonths, addDays, max as maxDate, startOfDay } from "date-fns";
import { prisma } from "@/lib/db";
import { isDineroConfigured, createQuarterlyInvoiceDraft, type DineroInvoiceLine } from "@/lib/dinero";
import { computeBillingPeriods, computePeriodAmounts } from "@/lib/invoice-schedule";
import { totalContractValue } from "@/lib/labels";
import {
  parseContractProducts,
  establishmentLineItems,
  recurringLineItems,
  allSelectedProductLabels,
  recurringProductLabels,
} from "@/lib/contract-template-data";
import type { DealStage } from "@prisma/client";

const ACTIVE_CUSTOMER_STAGES: DealStage[] = ["CONTRACT_SIGNED", "FILMED", "LIVE"];
const HANDLED_STATUSES = ["DRAFT_CREATED", "IMPORTED"];
/** How far past "now" to keep generating rolling periods for, so upcoming
 * quarters are always ready to draft ahead of their trigger date. */
const ROLLING_HORIZON_MONTHS = 4;

export type InvoiceRunSummary = {
  configured: boolean;
  checked: number;
  created: number;
  failed: number;
  churned?: number;
};

type DueLine = { quarterIndex: number; amount: number; scheduledDate: Date };

/**
 * Due lines for a deal's *current* contract term: a one-time establishment
 * fee (quarterIndex 0) plus calendar-quarter-aligned recurring periods
 * (quarterIndex 1+), each drafted on the 22nd of the month before it
 * starts. Only lines whose trigger date has passed are returned.
 *
 * The establishment fee bills the day after the contract is signed -
 * independent of billingStartDate, since that's the delivery/go-live date
 * and signing typically happens well before delivery. Deals imported
 * without a recorded signing date fall back to billingStartDate so they
 * still get invoiced.
 *
 * The recurring periods still depend on billingStartDate. Billing only
 * ever applies going forward from today - never retroactively backfill
 * quarters that have already fully elapsed (e.g. a customer whose
 * billingStartDate predates this automation existing).
 *
 * Billing isn't cut off just because the binding period has ended - most
 * contracts roll on until they're actually terminated (with notice). So
 * periods are generated up to the deal's computed `contractEndDate` if a
 * termination notice has been given, or otherwise up to a rolling horizon
 * a few months ahead, so upcoming quarters are always ready in time.
 */
function computeDueLines(deal: {
  saleAmount: number | null;
  bindingMonths: number | null;
  establishmentFee: number | null;
  billingStartDate: Date | null;
  contractSignedAt: Date | null;
  contractEndDate: Date | null;
}): DueLine[] {
  const now = new Date();
  const lines: DueLine[] = [];

  const establishmentDueDate = deal.contractSignedAt ? addDays(deal.contractSignedAt, 1) : deal.billingStartDate;
  if (deal.establishmentFee && deal.establishmentFee > 0 && establishmentDueDate && establishmentDueDate <= now) {
    lines.push({
      quarterIndex: 0,
      amount: deal.establishmentFee,
      scheduledDate: establishmentDueDate,
    });
  }

  if (!deal.billingStartDate || !deal.saleAmount || !deal.bindingMonths) return lines;

  const contractEnd = addMonths(deal.billingStartDate, deal.bindingMonths);
  const until = deal.contractEndDate ?? maxDate([contractEnd, addMonths(now, ROLLING_HORIZON_MONTHS)]);

  const periods = computeBillingPeriods(deal.billingStartDate, deal.bindingMonths, until);
  // saleAmount is the monthly fee; computePeriodAmounts wants the contract's total value for the binding period.
  const amounts = computePeriodAmounts(totalContractValue(deal), periods, deal.billingStartDate, deal.bindingMonths);

  // firstRelevantIndex is the first period that hasn't ended yet; anything
  // before it is stale history and is skipped entirely.
  const firstRelevantIndex = periods.findIndex((p) => p.endDate >= now);

  periods.forEach((period, i) => {
    if (i < firstRelevantIndex) return;
    if (period.draftTriggerDate > now) return;
    lines.push({
      quarterIndex: period.index,
      amount: amounts[i],
      scheduledDate: period.startDate,
    });
  });

  return lines;
}

type DraftableDeal = {
  id: string;
  companyName: string;
  cvrNumber: string | null;
  invoiceEmail: string | null;
  contactEmail: string | null;
  address: string | null;
  dineroContactGuid: string | null;
  soldProduct: string | null;
  contractProducts: unknown;
};

/**
 * Builds the invoice-level note and per-product line items for a due line.
 * Itemizes by product using the deal's contractProducts snapshot (recorded
 * when the contract was signed) - one line per product's setup fee for the
 * establishment invoice (quarterIndex 0), or one line per recurring
 * product proportional to its share of the period's total for later
 * quarters. Deals without a usable contractProducts snapshot (e.g. older
 * or imported deals) fall back to a single flat line, as before.
 */
function buildInvoiceContent(
  deal: { soldProduct: string | null; contractProducts: unknown },
  quarterIndex: number,
  totalAmount: number
): { note: string; lines: DineroInvoiceLine[] } {
  const products = parseContractProducts(deal.contractProducts);

  if (quarterIndex === 0) {
    if (!products) return { note: "Etableringsgebyr", lines: [{ description: "Etableringsgebyr", amount: totalAmount }] };
    const labels = allSelectedProductLabels(products);
    return {
      note: labels.length > 0 ? `Etablering af ${labels.join(" + ")}` : "Etableringsgebyr",
      lines: establishmentLineItems(products, totalAmount),
    };
  }

  const fallback = { note: `${deal.soldProduct ?? "Ydelse"} - periode ${quarterIndex}` };
  if (!products) return { ...fallback, lines: [{ description: deal.soldProduct ?? "Ydelse", amount: totalAmount }] };

  const recurringLabels = recurringProductLabels(products);
  const lines = recurringLineItems(products, totalAmount);
  if (lines.length === 0) return { ...fallback, lines: [{ description: deal.soldProduct ?? "Ydelse", amount: totalAmount }] };

  return { note: `${recurringLabels.join(" + ")} - periode ${quarterIndex}`, lines };
}

/**
 * Attempts to draft one invoice line in Dinero and records the outcome on
 * its Invoice row. Shared by the bulk quarterly run and the single-invoice
 * "Prøv igen" retry, so both go through the exact same success/failure
 * bookkeeping (contact-guid caching, failureReason, etc).
 */
async function draftInvoiceLine(
  deal: DraftableDeal,
  invoiceRow: { id: string; amount: number; quarterIndex: number }
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { note, lines } = buildInvoiceContent(deal, invoiceRow.quarterIndex, invoiceRow.amount);
    const result = await createQuarterlyInvoiceDraft({
      existingContactGuid: deal.dineroContactGuid,
      companyName: deal.companyName,
      cvrNumber: deal.cvrNumber,
      contactEmail: deal.invoiceEmail || deal.contactEmail,
      address: deal.address,
      note,
      lines,
      invoiceDate: new Date(),
    });

    await prisma.$transaction([
      prisma.invoice.update({
        where: { id: invoiceRow.id },
        data: {
          status: "DRAFT_CREATED",
          dineroInvoiceGuid: result.invoiceGuid,
          dineroInvoiceNumber: result.invoiceNumber,
          failureReason: null,
        },
      }),
      ...(deal.dineroContactGuid || result.isTest
        ? []
        : [prisma.deal.update({ where: { id: deal.id }, data: { dineroContactGuid: result.contactGuid } })]),
    ]);

    return { success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Ukendt fejl";
    await prisma.invoice.update({ where: { id: invoiceRow.id }, data: { status: "FAILED", failureReason: error } });
    return { success: false, error };
  }
}

/** Re-attempts drafting a single already-existing invoice row - e.g. after fixing a config
 * issue that made it fail - without re-running the full bulk generation. */
export async function retrySingleInvoice(invoiceId: string): Promise<{ success: boolean; error?: string }> {
  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { deal: true } });
  const result = await draftInvoiceLine(invoice.deal, invoice);
  return result.success ? { success: true } : { success: false, error: result.error };
}

/**
 * Creates Dinero invoice drafts for every due line (establishment fee +
 * calendar-aligned recurring periods) across all active, non-churned
 * deals. Safe to call repeatedly (e.g. from a daily cron): lines already
 * successfully drafted (or imported as historical) are skipped, but a
 * previously failed attempt is retried.
 */
export async function runQuarterlyInvoiceGeneration(): Promise<InvoiceRunSummary> {
  if (!(await isDineroConfigured())) {
    return { configured: false, checked: 0, created: 0, failed: 0 };
  }

  const deals = await prisma.deal.findMany({
    where: {
      stage: { in: ACTIVE_CUSTOMER_STAGES },
      saleAmount: { not: null },
      bindingMonths: { not: null },
      churnedAt: null,
    },
    include: { invoices: true },
  });

  let checked = 0;
  let created = 0;
  let failed = 0;

  for (const deal of deals) {
    const dueLines = computeDueLines(deal);
    const termInvoices = deal.invoices.filter((inv) => inv.termNumber === deal.currentTermNumber);

    for (const line of dueLines) {
      const existingInvoice = termInvoices.find((inv) => inv.quarterIndex === line.quarterIndex);
      if (existingInvoice && HANDLED_STATUSES.includes(existingInvoice.status)) continue;

      checked++;

      const invoiceRow = existingInvoice
        ? await prisma.invoice.update({
            where: { id: existingInvoice.id },
            data: { amount: line.amount, status: "PENDING", failureReason: null },
          })
        : await prisma.invoice.create({
            data: {
              dealId: deal.id,
              termNumber: deal.currentTermNumber,
              quarterIndex: line.quarterIndex,
              amount: line.amount,
              scheduledDate: line.scheduledDate,
              status: "PENDING",
            },
          });

      const result = await draftInvoiceLine(deal, invoiceRow);
      if (result.success) created++;
      else failed++;
    }
  }

  return { configured: true, checked, created, failed };
}

/**
 * Marks deals as inactive once their computed contract end date (from a
 * termination notice) has passed. Runs independently of whether Dinero is
 * configured, since churn is a CRM concern, not a billing-integration one.
 *
 * The customer counts as active through the whole of contractEndDate itself
 * (e.g. a 36-month binding still counts them on day 36) and only drops off
 * starting the day after - so this only churns once "today" is strictly
 * past that calendar day, not merely on-or-after it.
 */
export async function runAutoChurn(): Promise<{ churned: number }> {
  const today = startOfDay(new Date());
  const dueDeals = await prisma.deal.findMany({
    where: { churnedAt: null, contractEndDate: { lt: today } },
    select: { id: true, contractEndDate: true },
  });

  for (const deal of dueDeals) {
    await prisma.deal.update({ where: { id: deal.id }, data: { churnedAt: deal.contractEndDate } });
  }

  return { churned: dueDeals.length };
}
