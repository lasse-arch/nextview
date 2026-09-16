import { addMonths, max as maxDate } from "date-fns";
import { prisma } from "@/lib/db";
import { isDineroConfigured, createQuarterlyInvoiceDraft } from "@/lib/dinero";
import { computeBillingPeriods, computePeriodAmounts } from "@/lib/invoice-schedule";
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

type DueLine = { quarterIndex: number; amount: number; description: string; scheduledDate: Date };

/**
 * Due lines for a deal's *current* contract term: a one-time establishment
 * fee (quarterIndex 0, drafted immediately once billing has started) plus
 * calendar-quarter-aligned recurring periods (quarterIndex 1+), each
 * drafted on the 22nd of the month before it starts. Only lines whose
 * trigger date has passed are returned.
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
  soldProduct: string | null;
  contractEndDate: Date | null;
}): DueLine[] {
  if (!deal.billingStartDate || !deal.saleAmount || !deal.bindingMonths) return [];

  const now = new Date();
  const lines: DueLine[] = [];

  if (deal.establishmentFee && deal.establishmentFee > 0) {
    lines.push({
      quarterIndex: 0,
      amount: deal.establishmentFee,
      description: "Etableringsgebyr",
      scheduledDate: deal.billingStartDate,
    });
  }

  const contractEnd = addMonths(deal.billingStartDate, deal.bindingMonths);
  const until = deal.contractEndDate ?? maxDate([contractEnd, addMonths(now, ROLLING_HORIZON_MONTHS)]);

  const periods = computeBillingPeriods(deal.billingStartDate, deal.bindingMonths, until);
  const amounts = computePeriodAmounts(deal.saleAmount, periods, deal.billingStartDate, deal.bindingMonths);

  periods.forEach((period, i) => {
    if (period.draftTriggerDate > now) return;
    lines.push({
      quarterIndex: period.index,
      amount: amounts[i],
      description: `${deal.soldProduct ?? "Ydelse"} - periode ${period.index}`,
      scheduledDate: period.startDate,
    });
  });

  return lines;
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

      try {
        const result = await createQuarterlyInvoiceDraft({
          existingContactGuid: deal.dineroContactGuid,
          companyName: deal.companyName,
          cvrNumber: deal.cvrNumber,
          contactEmail: deal.invoiceEmail || deal.contactEmail,
          address: deal.address,
          description: line.description,
          amount: line.amount,
          invoiceDate: new Date(),
        });

        await prisma.$transaction([
          prisma.invoice.update({
            where: { id: invoiceRow.id },
            data: {
              status: "DRAFT_CREATED",
              dineroInvoiceGuid: result.invoiceGuid,
              dineroInvoiceNumber: result.invoiceNumber,
            },
          }),
          ...(deal.dineroContactGuid
            ? []
            : [prisma.deal.update({ where: { id: deal.id }, data: { dineroContactGuid: result.contactGuid } })]),
        ]);

        created++;
      } catch (err) {
        await prisma.invoice.update({
          where: { id: invoiceRow.id },
          data: { status: "FAILED", failureReason: err instanceof Error ? err.message : "Ukendt fejl" },
        });
        failed++;
      }
    }
  }

  return { configured: true, checked, created, failed };
}

/**
 * Marks deals as inactive once their computed contract end date (from a
 * termination notice) has passed. Runs independently of whether Dinero is
 * configured, since churn is a CRM concern, not a billing-integration one.
 */
export async function runAutoChurn(): Promise<{ churned: number }> {
  const now = new Date();
  const dueDeals = await prisma.deal.findMany({
    where: { churnedAt: null, contractEndDate: { lte: now } },
    select: { id: true, contractEndDate: true },
  });

  for (const deal of dueDeals) {
    await prisma.deal.update({ where: { id: deal.id }, data: { churnedAt: deal.contractEndDate } });
  }

  return { churned: dueDeals.length };
}
