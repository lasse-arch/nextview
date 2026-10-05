import { addMonths, subMonths, addDays, startOfMonth, max as maxDate, startOfDay } from "date-fns";
import { prisma } from "@/lib/db";
import { isDineroConfigured, createQuarterlyInvoiceDraft, getInvoicePaymentStatus, type DineroInvoiceLine } from "@/lib/dinero";
import { computeBillingPeriods, computePeriodAmounts } from "@/lib/invoice-schedule";
import { totalContractValue, invoicePeriodLabel, formatDate, dealName } from "@/lib/labels";
import {
  parseContractProducts,
  establishmentLineItems,
  recurringLineItems,
  allSelectedProductLabels,
  recurringProductLabels,
} from "@/lib/contract-template-data";
import type { DealStage, PaymentMethod } from "@prisma/client";
import { collectionDateForPeriod, deliveryDeadline, earliestCollectionDate, utcDay } from "@/lib/betalingsservice/banking-days";

const ACTIVE_CUSTOMER_STAGES: DealStage[] = ["CONTRACT_SIGNED", "FILMED", "LIVE"];
const HANDLED_STATUSES = ["DRAFT_CREATED", "IMPORTED", "SENT_MANUALLY"];
/** How far past "now" to keep generating rolling periods for, so upcoming
 * quarters are always ready to draft ahead of their trigger date. */
const ROLLING_HORIZON_MONTHS = 4;

/** The CRM only started being used for invoicing from Q4 2026 - some deals'
 * billingStartDate predates that (backfilled from before the system was in
 * use), so without this floor both the automated due-line generator and the
 * "marker kvartal sendt manuelt" picker would treat Q1-Q3 2026 as real,
 * unhandled quarters - e.g. marking Q4 done by hand and then hitting "Opret
 * faktura-kladde" would draft Q3 right after, since nothing had marked it
 * handled and it hadn't technically finished yet. Periods before this floor
 * are skipped entirely, the same as already-elapsed ones. */
const INVOICING_FLOOR = new Date(2026, 9, 1);

export type InvoiceRunSummary = {
  configured: boolean;
  checked: number;
  created: number;
  failed: number;
  churned?: number;
  paymentsChecked?: number;
  paymentsNewlyPaid?: number;
  /** Set only when nothing was due right now - when the next quarterly (or establishment) draft will actually become due. */
  nextDueDateLabel?: string;
};

type DueLine = { quarterIndex: number; amount: number; scheduledDate: Date };

/**
 * Due lines for a deal's *current* contract term: a one-time establishment
 * fee (quarterIndex 0) plus calendar-quarter-aligned recurring periods
 * (quarterIndex 1+), each draftable a short lead time before it starts (see
 * DRAFT_LEAD_TIME_DAYS in invoice-schedule.ts). Only lines whose trigger
 * date has passed are returned.
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
 *
 * `handledQuarterIndexes` (e.g. one marked "sendt manuelt") is skipped
 * entirely - not just excluded from the due lines, but also from
 * `nextDueDate`, so an already-handled quarter's trigger date doesn't get
 * reported as the next thing coming up when a later, still-unhandled
 * quarter is actually next.
 */
function computeDueLines(
  deal: {
    saleAmount: number | null;
    bindingMonths: number | null;
    establishmentFee: number | null;
    billingStartDate: Date | null;
    contractSignedAt: Date | null;
    contractEndDate: Date | null;
  },
  options: { sendEstablishmentNow?: boolean; sendPeriodsNow?: boolean; betalingsservice?: boolean } = {},
  handledQuarterIndexes: Set<number> = new Set()
): { lines: DueLine[]; nextDueDate: Date | null } {
  const now = new Date();
  const lines: DueLine[] = [];
  let nextDueDate: Date | null = null;

  const establishmentDueDate = deal.contractSignedAt ? addDays(deal.contractSignedAt, 1) : deal.billingStartDate;
  // Normally the establishment fee waits until the day after signing, so
  // it's not drafted the very same moment a contract gets signed. A seller
  // choosing to send it same-day via the deal page's manual button can
  // override that wait with sendEstablishmentNow.
  const establishmentReady = options.sendEstablishmentNow
    ? Boolean(deal.contractSignedAt || deal.billingStartDate)
    : Boolean(establishmentDueDate && establishmentDueDate <= now);
  if (deal.establishmentFee && deal.establishmentFee > 0 && !handledQuarterIndexes.has(0)) {
    if (establishmentReady) {
      lines.push({
        quarterIndex: 0,
        amount: deal.establishmentFee,
        scheduledDate: establishmentDueDate ?? now,
      });
    } else if (establishmentDueDate) {
      nextDueDate = establishmentDueDate;
    }
  }

  if (!deal.billingStartDate || !deal.saleAmount || !deal.bindingMonths) return { lines, nextDueDate };

  const contractEnd = addMonths(deal.billingStartDate, deal.bindingMonths);
  const until = deal.contractEndDate ?? maxDate([contractEnd, addMonths(now, ROLLING_HORIZON_MONTHS)]);

  const periods = computeBillingPeriods(deal.billingStartDate, deal.bindingMonths, until);
  // saleAmount is the monthly fee; computePeriodAmounts wants the contract's total value for the binding period.
  const amounts = computePeriodAmounts(totalContractValue(deal), periods, deal.billingStartDate, deal.bindingMonths);

  // firstRelevantIndex is the first period that hasn't ended yet and starts
  // at or after the system's real invoicing floor; anything before it is
  // stale history and is skipped entirely. findIndex returns -1 when NO
  // period qualifies (e.g. a short contract that fully ended before the
  // floor) - that must mean "skip all of them", not "skip none": `i < -1`
  // is never true, so treating -1 literally would have flooded every
  // historical period back in as newly due all at once.
  const firstRelevantIndexRaw = periods.findIndex((p) => p.endDate >= now && p.startDate >= INVOICING_FLOOR);
  const firstRelevantIndex = firstRelevantIndexRaw === -1 ? periods.length : firstRelevantIndexRaw;

  // A seller manually clicking "Opret faktura-kladde" (sendPeriodsNow) can
  // jump the gun on the very next NOT-YET-DUE period's own lead time, the
  // same way sendEstablishmentNow already does for the establishment fee -
  // but only that single one: `sawFirstNotDuePeriod` makes sure a period
  // further out is never forced just because an earlier one it was blocked
  // on (see below) wasn't - it's either that period or nothing this run,
  // not "skip ahead to whichever period after it happens to be forceable".
  //
  // A period starting 1 January additionally can't be forced at all until
  // December (the last month of the preceding quarter) has actually
  // started - jumping it earlier would risk a seller sending a new year's
  // first invoice while still deep in the old year.
  let sawFirstNotDuePeriod = false;
  periods.forEach((period, i) => {
    if (i < firstRelevantIndex) return;
    if (handledQuarterIndexes.has(period.index)) return;

    // A Betalingsservice customer's quarter has to be in a BS file by the
    // 6th last banking day of the month before it starts, so its invoice is
    // made from the 1st of that month instead of a week before.
    const draftTriggerDate = options.betalingsservice
      ? startOfMonth(subMonths(period.startDate, 1))
      : period.draftTriggerDate;

    if (draftTriggerDate <= now) {
      lines.push({ quarterIndex: period.index, amount: amounts[i], scheduledDate: period.startDate });
      return;
    }

    if (!nextDueDate || draftTriggerDate < nextDueDate) nextDueDate = draftTriggerDate;
    if (sawFirstNotDuePeriod) return;
    sawFirstNotDuePeriod = true;

    const isCalendarYearStart = period.startDate.getMonth() === 0 && period.startDate.getDate() === 1;
    const canForceThisPeriod = !isCalendarYearStart || now >= startOfMonth(subMonths(period.startDate, 1));
    if (options.sendPeriodsNow && canForceThisPeriod) {
      lines.push({ quarterIndex: period.index, amount: amounts[i], scheduledDate: period.startDate });
    }
  });

  return { lines, nextDueDate };
}

type DraftableDeal = {
  id: string;
  companyName: string;
  cvrNumber: string | null;
  invoiceEmail: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  dineroContactGuid: string | null;
  soldProduct: string | null;
  contractProducts: unknown;
  paymentMethod: PaymentMethod;
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
/**
 * The invoice's wording (note + line item descriptions) follows the
 * language the customer's contract was actually sent in - stored as
 * `language` inside the deal's own snapshotted contractProducts (see
 * ContractProducts) - so a customer who signed an English contract also
 * gets an English invoice, not a Danish one just because we operate in
 * Danish internally.
 */
function buildInvoiceContent(
  deal: { soldProduct: string | null; contractProducts: unknown },
  quarterIndex: number,
  totalAmount: number,
  scheduledDate: Date
): { note: string; lines: DineroInvoiceLine[] } {
  const products = parseContractProducts(deal.contractProducts);
  const language = products?.language ?? "da";
  const setupFeeFallback = language === "en" ? "Setup fee" : "Etableringsgebyr";
  const serviceFallback = language === "en" ? "Service" : "Ydelse";

  if (quarterIndex === 0) {
    if (!products) return { note: setupFeeFallback, lines: [{ description: setupFeeFallback, amount: totalAmount }] };
    const labels = allSelectedProductLabels(products, language);
    return {
      note: labels.length > 0 ? `${language === "en" ? "Setup of" : "Etablering af"} ${labels.join(" + ")}` : setupFeeFallback,
      lines: establishmentLineItems(products, totalAmount, language),
    };
  }

  const quarter = invoicePeriodLabel(scheduledDate, language);
  const fallback = { note: `${deal.soldProduct ?? serviceFallback} - ${quarter}` };
  if (!products) return { ...fallback, lines: [{ description: deal.soldProduct ?? serviceFallback, amount: totalAmount }] };

  const recurringLabels = recurringProductLabels(products, language);
  const lines = recurringLineItems(products, totalAmount, language);
  if (lines.length === 0) return { ...fallback, lines: [{ description: deal.soldProduct ?? serviceFallback, amount: totalAmount }] };

  return { note: `${recurringLabels.join(" + ")} - ${quarter}`, lines };
}

/**
 * Same as buildInvoiceContent, but merges several due lines - possibly from
 * different deals - into ONE Dinero invoice's note + line items (see
 * Deal.combinedInvoicing). Each deal's own line descriptions are prefixed
 * with that deal's name whenever more than one distinct deal is actually
 * involved, so a combined invoice still reads clearly as covering two
 * separate things rather than looking like one doubled-up line item.
 */
function buildCombinedInvoiceContent(
  items: { deal: { companyName: string; displayName: string | null; soldProduct: string | null; contractProducts: unknown }; quarterIndex: number; amount: number; scheduledDate: Date }[]
): { note: string; lines: DineroInvoiceLine[] } {
  const distinctDealNames = new Set(items.map((i) => dealName(i.deal)));
  const multipleDeals = distinctDealNames.size > 1;

  const parts = items.map((item) => ({
    dealLabel: dealName(item.deal),
    ...buildInvoiceContent(item.deal, item.quarterIndex, item.amount, item.scheduledDate),
  }));

  const lines = parts.flatMap((p) =>
    p.lines.map((line) => ({ ...line, description: multipleDeals ? `${p.dealLabel} - ${line.description}` : line.description }))
  );
  const note = parts.map((p) => (multipleDeals ? `${p.dealLabel}: ${p.note}` : p.note)).join(" + ");

  return { note, lines };
}

/**
 * A recurring period's Dinero invoice date. Normally backdated 8 days
 * (Dinero's own Netto+8 payment terms, see createQuarterlyInvoiceDraft) so
 * the due date lands exactly on the period's own start date, regardless of
 * which day within the draft's lead-time window it's actually drafted on -
 * except a period starting 1 January, which is dated that same 1 January
 * with no backdating (due date landing 9 January instead), so a new
 * calendar year's first invoice is never dated into the year before the
 * revenue it covers.
 */
function computeRecurringInvoiceDate(periodStart: Date): Date {
  const isCalendarYearStart = periodStart.getMonth() === 0 && periodStart.getDate() === 1;
  return isCalendarYearStart ? periodStart : addDays(periodStart, -8);
}

/** Every Dinero invoice is created with Netto 8 payment terms (dinero.ts). */
function invoiceDueDate(invoiceDate: Date): Date {
  return addDays(invoiceDate, 8);
}

type InvoiceTerms = {
  invoiceDate: Date;
  paymentDays: number;
  dueDate: Date;
  collectViaBs: boolean;
  /** Appended to the invoice's note (Dinero "Kommentarer"). */
  noteSuffix: string | null;
};

/** Today's calendar day in Copenhagen, as UTC midnight (see banking-days.ts). */
function copenhagenToday(now: Date): Date {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Copenhagen" }).format(now).split("-").map(Number);
  return utcDay(y, m - 1, d);
}

/**
 * Dinero date, payment terms and due date for an invoice. A normal customer
 * - and every establishment fee - gets Netto 8 (see
 * computeRecurringInvoiceDate). A Betalingsservice customer's quarterly
 * invoice is dated today and due on its collection date - the first banking
 * day of the quarter, or for a quarter drafted too late for its own month's
 * BS deadline the first reachable first-of-month - with a note telling them
 * not to pay by bank transfer, since the amount is collected through
 * Betalingsservice.
 */
export function invoiceTerms(
  paymentMethod: PaymentMethod,
  quarterIndex: number,
  scheduledDate: Date,
  language: "da" | "en",
  now = new Date()
): InvoiceTerms {
  // The establishment fee is always a normal invoice the customer pays
  // themselves - only the recurring quarters go through Betalingsservice.
  if (paymentMethod !== "BETALINGSSERVICE" || quarterIndex === 0) {
    const invoiceDate = quarterIndex === 0 ? new Date() : computeRecurringInvoiceDate(scheduledDate);
    return { invoiceDate, paymentDays: 8, dueDate: invoiceDueDate(invoiceDate), collectViaBs: false, noteSuffix: null };
  }

  const today = copenhagenToday(now);
  let collectionDate = collectionDateForPeriod(scheduledDate);
  if (deliveryDeadline(collectionDate).getTime() - now.getTime() < 24 * 60 * 60 * 1000) {
    collectionDate = earliestCollectionDate(now);
  }
  const paymentDays = Math.round((collectionDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  const dateLabel = new Intl.DateTimeFormat(language === "en" ? "en-GB" : "da-DK", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(collectionDate);
  const noteSuffix =
    language === "en"
      ? `The amount will be collected via Betalingsservice on ${dateLabel} - please do not pay by bank transfer.`
      : `Beløbet opkræves via Betalingsservice d. ${dateLabel} - betal venligst ikke via bankoverførsel.`;
  return { invoiceDate: today, paymentDays, dueDate: collectionDate, collectViaBs: true, noteSuffix };
}

function withNoteSuffix(note: string, suffix: string | null): string {
  return suffix ? `${note}\n\n${suffix}` : note;
}

function invoiceLanguage(deal: { contractProducts: unknown }): "da" | "en" {
  return parseContractProducts(deal.contractProducts)?.language === "en" ? "en" : "da";
}

/**
 * Attempts to draft one invoice line in Dinero and records the outcome on
 * its Invoice row. Shared by the bulk quarterly run and the single-invoice
 * "Prøv igen" retry, so both go through the exact same success/failure
 * bookkeeping (contact-guid caching, failureReason, etc).
 *
 * `contactGuidHint` is passed in explicitly (rather than always reading
 * `deal.dineroContactGuid`) so a caller drafting several lines for the same
 * deal back-to-back (e.g. establishment + a quarter, both due at once) can
 * carry forward the contact just created by an earlier line in the same
 * batch - otherwise a fresh contact might not show up yet in Dinero's own
 * CVR lookup by the time the very next line runs, creating a duplicate.
 */
async function draftInvoiceLine(
  deal: DraftableDeal,
  invoiceRow: { id: string; amount: number; quarterIndex: number; scheduledDate: Date },
  contactGuidHint: string | null
): Promise<{ success: true; contactGuid: string } | { success: false; error: string }> {
  try {
    const { note, lines } = buildInvoiceContent(deal, invoiceRow.quarterIndex, invoiceRow.amount, invoiceRow.scheduledDate);
    // See computeRecurringInvoiceDate. The one-off establishment fee has no
    // period to align a due date to, so it's simply dated whenever it's
    // actually drafted.
    const terms = invoiceTerms(deal.paymentMethod, invoiceRow.quarterIndex, invoiceRow.scheduledDate, invoiceLanguage(deal));
    const { invoiceDate } = terms;
    const result = await createQuarterlyInvoiceDraft({
      existingContactGuid: contactGuidHint,
      companyName: deal.companyName,
      cvrNumber: deal.cvrNumber,
      contactEmail: deal.invoiceEmail || deal.contactEmail,
      contactPhone: deal.contactPhone,
      address: deal.address,
      note: withNoteSuffix(note, terms.noteSuffix),
      lines,
      invoiceDate,
      paymentDays: terms.paymentDays,
    });

    await prisma.$transaction([
      prisma.invoice.update({
        where: { id: invoiceRow.id },
        data: {
          status: "DRAFT_CREATED",
          dineroInvoiceGuid: result.invoiceGuid,
          dineroInvoiceNumber: result.invoiceNumber,
          sentAt: result.sendError ? null : new Date(),
          dueDate: terms.dueDate,
          collectViaBs: terms.collectViaBs,
          // The draft itself was created successfully - keep that status even
          // if the automatic booking/emailing step afterwards failed, so a
          // retry never creates a second, duplicate draft for the same
          // period. The send error is kept here just to stay visible; it
          // needs a human to book/send the existing draft by hand in Dinero.
          failureReason: result.sendError ? `Oprettet, men ikke sendt automatisk: ${result.sendError}` : null,
        },
      }),
      // Keep the cached contact GUID in sync with whatever Dinero actually
      // used - not just the first time it's set. Dinero can end up creating
      // a different (e.g. freshly recovered) contact than the one cached
      // here, and leaving the stale GUID in place would make every future
      // invoice for this deal keep failing against a dead contact ID.
      ...(result.isTest || deal.dineroContactGuid === result.contactGuid
        ? []
        : [prisma.deal.update({ where: { id: deal.id }, data: { dineroContactGuid: result.contactGuid } })]),
    ]);

    return { success: true, contactGuid: result.contactGuid };
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
  const result = await draftInvoiceLine(invoice.deal, invoice, invoice.deal.dineroContactGuid);
  return result.success ? { success: true } : { success: false, error: result.error };
}

type DealWithInvoices = DraftableDeal & {
  id: string;
  displayName: string | null;
  parentDealId: string | null;
  currentTermNumber: number;
  saleAmount: number | null;
  bindingMonths: number | null;
  establishmentFee: number | null;
  billingStartDate: Date | null;
  contractSignedAt: Date | null;
  contractEndDate: Date | null;
  invoices: { id: string; termNumber: number; quarterIndex: number; status: string }[];
};

/** Drafts every currently-due invoice line for one deal. Shared by the bulk
 * daily run and the "Opret faktura-kladde" button on the deal page. */
async function processDealDueInvoices(
  deal: DealWithInvoices,
  options: { sendEstablishmentNow?: boolean; sendPeriodsNow?: boolean } = {}
): Promise<{ checked: number; created: number; failed: number; nextDueDate: Date | null }> {
  const termInvoices = deal.invoices.filter((inv) => inv.termNumber === deal.currentTermNumber);
  const handledQuarterIndexes = new Set(
    termInvoices.filter((inv) => HANDLED_STATUSES.includes(inv.status)).map((inv) => inv.quarterIndex)
  );
  const { lines: dueLines, nextDueDate } = computeDueLines(
    deal,
    { ...options, betalingsservice: deal.paymentMethod === "BETALINGSSERVICE" },
    handledQuarterIndexes
  );

  let checked = 0;
  let created = 0;
  let failed = 0;
  // Carried forward across lines so a contact just created for e.g. the
  // establishment fee is reused directly for the next due line (a quarter)
  // in the same run, instead of re-querying Dinero's CVR lookup - which may
  // not see a contact created moments earlier yet, creating a duplicate.
  let contactGuidHint = deal.dineroContactGuid;

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

    const result = await draftInvoiceLine(deal, invoiceRow, contactGuidHint);
    if (result.success) {
      created++;
      contactGuidHint = result.contactGuid;
    } else {
      failed++;
    }
  }

  return { checked, created, failed, nextDueDate };
}

/**
 * Finds every group of 2+ deals that should be billed as one combined
 * Dinero invoice (see Deal.combinedInvoicing): a parent with the flag set,
 * clustered with whichever of its branches share its exact cvrNumber. Most
 * linked branches (independent legal entities, each with their own CVR)
 * never match anything here and keep billing separately, flag or no flag -
 * only an actual CVR match inside an opted-in group forms a combined group.
 */
async function findCombinedBillingGroups(): Promise<string[][]> {
  const parents = await prisma.deal.findMany({
    where: { combinedInvoicing: true },
    select: { id: true, cvrNumber: true, branches: { select: { id: true, cvrNumber: true } } },
  });

  const groups: string[][] = [];
  for (const parent of parents) {
    const family = [{ id: parent.id, cvrNumber: parent.cvrNumber }, ...parent.branches];
    const byCvr = new Map<string, string[]>();
    for (const member of family) {
      if (!member.cvrNumber) continue;
      const ids = byCvr.get(member.cvrNumber) ?? [];
      ids.push(member.id);
      byCvr.set(member.cvrNumber, ids);
    }
    for (const ids of byCvr.values()) {
      if (ids.length >= 2) groups.push(ids);
    }
  }
  return groups;
}

/**
 * Same job as processDealDueInvoices, but across a whole combined-billing
 * group (see findCombinedBillingGroups): every member's own due lines are
 * computed exactly as normal (each deal still tracks its own term/billing
 * dates independently), then - if 2+ deals actually have something due in
 * this run - drafted as ONE Dinero invoice instead of one each. A group
 * where only one member happens to have something due this run is just
 * passed straight through to the normal single-deal path, since there's
 * nothing to combine yet.
 */
async function processCombinedDueInvoices(
  deals: DealWithInvoices[],
  options: { sendEstablishmentNow?: boolean; sendPeriodsNow?: boolean } = {}
): Promise<{ checked: number; created: number; failed: number }> {
  const perDeal = deals.map((deal) => {
    const termInvoices = deal.invoices.filter((inv) => inv.termNumber === deal.currentTermNumber);
    const handledQuarterIndexes = new Set(
      termInvoices.filter((inv) => HANDLED_STATUSES.includes(inv.status)).map((inv) => inv.quarterIndex)
    );
    const { lines } = computeDueLines(
      deal,
      { ...options, betalingsservice: deal.paymentMethod === "BETALINGSSERVICE" },
      handledQuarterIndexes
    );
    const dueLines = lines.filter((line) => {
      const existing = termInvoices.find((inv) => inv.quarterIndex === line.quarterIndex);
      return !(existing && HANDLED_STATUSES.includes(existing.status));
    });
    return { deal, termInvoices, dueLines };
  });

  const withDue = perDeal.filter((p) => p.dueLines.length > 0);
  if (withDue.length === 0) return { checked: 0, created: 0, failed: 0 };
  if (withDue.length === 1) {
    const { nextDueDate: _nextDueDate, ...rest } = await processDealDueInvoices(withDue[0].deal, options);
    return rest;
  }

  let checked = 0;
  const invoiceRows: { deal: DealWithInvoices; invoiceRow: { id: string; quarterIndex: number; amount: number; scheduledDate: Date } }[] = [];

  for (const { deal, termInvoices, dueLines } of withDue) {
    for (const line of dueLines) {
      checked++;
      const existing = termInvoices.find((inv) => inv.quarterIndex === line.quarterIndex);
      const invoiceRow = existing
        ? await prisma.invoice.update({
            where: { id: existing.id },
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
      invoiceRows.push({ deal, invoiceRow });
    }
  }

  // The parent (no parentDealId) carries the group's actual contact details
  // - every member shares the same CVR by construction, but only the
  // parent is guaranteed to be the one actually filled in/maintained.
  const leadDeal = withDue.find((p) => !p.deal.parentDealId)?.deal ?? withDue[0].deal;
  const { note, lines } = buildCombinedInvoiceContent(
    invoiceRows.map(({ deal, invoiceRow }) => ({
      deal,
      quarterIndex: invoiceRow.quarterIndex,
      amount: invoiceRow.amount,
      scheduledDate: invoiceRow.scheduledDate,
    }))
  );
  const anyRecurringLine = invoiceRows.find((r) => r.invoiceRow.quarterIndex > 0);
  // A combined invoice that includes an establishment fee is a normal
  // invoice as a whole, since the establishment fee is never collected
  // through Betalingsservice.
  const hasEstablishmentLine = invoiceRows.some((r) => r.invoiceRow.quarterIndex === 0);
  const terms = invoiceTerms(
    hasEstablishmentLine ? "INVOICE" : leadDeal.paymentMethod,
    anyRecurringLine ? anyRecurringLine.invoiceRow.quarterIndex : 0,
    (anyRecurringLine ?? invoiceRows[0]).invoiceRow.scheduledDate,
    invoiceLanguage(leadDeal)
  );
  const { invoiceDate } = terms;

  try {
    const result = await createQuarterlyInvoiceDraft({
      existingContactGuid: leadDeal.dineroContactGuid,
      companyName: leadDeal.companyName,
      cvrNumber: leadDeal.cvrNumber,
      contactEmail: leadDeal.invoiceEmail || leadDeal.contactEmail,
      contactPhone: leadDeal.contactPhone,
      address: leadDeal.address,
      note: withNoteSuffix(note, terms.noteSuffix),
      lines,
      invoiceDate,
      paymentDays: terms.paymentDays,
    });

    await prisma.$transaction([
      ...invoiceRows.map(({ invoiceRow }) =>
        prisma.invoice.update({
          where: { id: invoiceRow.id },
          data: {
            status: "DRAFT_CREATED",
            dineroInvoiceGuid: result.invoiceGuid,
            dineroInvoiceNumber: result.invoiceNumber,
            sentAt: result.sendError ? null : new Date(),
            dueDate: terms.dueDate,
            collectViaBs: terms.collectViaBs,
            failureReason: result.sendError ? `Oprettet, men ikke sendt automatisk: ${result.sendError}` : null,
          },
        })
      ),
      ...(result.isTest || leadDeal.dineroContactGuid === result.contactGuid
        ? []
        : [prisma.deal.update({ where: { id: leadDeal.id }, data: { dineroContactGuid: result.contactGuid } })]),
    ]);

    return { checked, created: invoiceRows.length, failed: 0 };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Ukendt fejl";
    await prisma.$transaction(
      invoiceRows.map(({ invoiceRow }) =>
        prisma.invoice.update({ where: { id: invoiceRow.id }, data: { status: "FAILED", failureReason: error } })
      )
    );
    return { checked, created: 0, failed: invoiceRows.length };
  }
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

  const [deals, combinedGroups] = await Promise.all([
    prisma.deal.findMany({
      where: {
        stage: { in: ACTIVE_CUSTOMER_STAGES },
        saleAmount: { not: null },
        bindingMonths: { not: null },
        churnedAt: null,
      },
      include: { invoices: true },
    }),
    findCombinedBillingGroups(),
  ]);
  const dealById = new Map(deals.map((d) => [d.id, d]));

  let checked = 0;
  let created = 0;
  let failed = 0;
  const involvedIds = new Set<string>();

  for (const group of combinedGroups) {
    const groupDeals = group.map((id) => dealById.get(id)).filter((d): d is (typeof deals)[number] => Boolean(d));
    // Fewer than 2 of this group's members are actually billable right now
    // (e.g. one has since churned, or never got saleAmount/bindingMonths
    // filled in) - nothing to combine, so leave them for the normal
    // per-deal loop below instead of marking them "handled" here.
    if (groupDeals.length < 2) continue;
    groupDeals.forEach((d) => involvedIds.add(d.id));

    const result = await processCombinedDueInvoices(groupDeals);
    checked += result.checked;
    created += result.created;
    failed += result.failed;
    if (result.checked > 0) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  for (const deal of deals) {
    if (involvedIds.has(deal.id)) continue;
    const result = await processDealDueInvoices(deal);
    checked += result.checked;
    created += result.created;
    failed += result.failed;

    // Space out bulk runs a little - each due line is already several
    // sequential Dinero calls (contact lookup/create/update, invoice
    // create), and firing that for many deals back-to-back with no gap can
    // still burst past Dinero's rate limit even though dineroFetch retries
    // individual 429s.
    if (result.checked > 0) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  return { configured: true, checked, created, failed };
}

/**
 * Manually drafts invoice lines for a single deal - the "Opret faktura-
 * kladde" button on the deal page, for when an admin doesn't want to wait
 * for the daily cron. Both the establishment fee and the very next
 * recurring period are drafted right away even if their own lead time
 * hasn't started yet (sendEstablishmentNow/sendPeriodsNow) - a seller
 * clicking this button has already decided it's time, regardless of what
 * the automatic schedule would otherwise wait for.
 *
 * If this deal is part of a combined-billing group (Deal.combinedInvoicing
 * + a shared cvrNumber with at least one linked branch), clicking the
 * button on EITHER member drafts one combined invoice for the whole group,
 * not just this one deal.
 */
export async function generateInvoiceForDeal(dealId: string): Promise<InvoiceRunSummary> {
  if (!(await isDineroConfigured())) {
    return { configured: false, checked: 0, created: 0, failed: 0 };
  }

  const combinedGroups = await findCombinedBillingGroups();
  const myGroup = combinedGroups.find((group) => group.includes(dealId));
  if (myGroup) {
    const groupDeals = await prisma.deal.findMany({ where: { id: { in: myGroup } }, include: { invoices: true } });
    const eligible = groupDeals.filter((d) => d.saleAmount && d.bindingMonths && !d.churnedAt);
    if (eligible.length >= 2) {
      const result = await processCombinedDueInvoices(eligible, { sendEstablishmentNow: true, sendPeriodsNow: true });
      return { configured: true, ...result };
    }
  }

  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId }, include: { invoices: true } });
  const { nextDueDate, ...result } = await processDealDueInvoices(deal, {
    sendEstablishmentNow: true,
    sendPeriodsNow: true,
  });
  return {
    configured: true,
    ...result,
    nextDueDateLabel: result.checked === 0 && nextDueDate ? formatDate(nextDueDate) : undefined,
  };
}

export type InvoicePreviewLine = { label: string; amount: number };

/**
 * What "Opret faktura-kladde" would actually draft and send right now, for
 * the confirmation dialog shown before it commits to anything - computed
 * the same way generateInvoiceForDeal decides what's due, but without
 * creating any Invoice rows or calling Dinero.
 */
export async function previewInvoiceForDeal(dealId: string): Promise<InvoicePreviewLine[]> {
  if (!(await isDineroConfigured())) return [];

  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId }, include: { invoices: true } });
  const termInvoices = deal.invoices.filter((inv) => inv.termNumber === deal.currentTermNumber);
  const handledQuarterIndexes = new Set(
    termInvoices.filter((inv) => HANDLED_STATUSES.includes(inv.status)).map((inv) => inv.quarterIndex)
  );
  const { lines } = computeDueLines(deal, { sendEstablishmentNow: true, sendPeriodsNow: true }, handledQuarterIndexes);

  return lines.map((line) => ({
    label: line.quarterIndex === 0 ? "Etableringspris" : invoicePeriodLabel(line.scheduledDate),
    amount: line.amount,
  }));
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

/**
 * Marks a deal's establishment invoice as handled by hand outside Dinero-kladden
 * (e.g. the seller sent it directly themselves) - creates the tracking row if none
 * exists yet, or overwrites whatever state an existing one was in. Either way, the
 * automated generator will never touch this line again (see HANDLED_STATUSES).
 */
export async function markEstablishmentSentManually(dealId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  if (!deal.establishmentFee || deal.establishmentFee <= 0) {
    return { ok: false, error: "Denne deal har intet etableringsgebyr." };
  }

  await prisma.invoice.upsert({
    where: { dealId_termNumber_quarterIndex: { dealId, termNumber: deal.currentTermNumber, quarterIndex: 0 } },
    create: {
      dealId,
      termNumber: deal.currentTermNumber,
      quarterIndex: 0,
      amount: deal.establishmentFee,
      scheduledDate: new Date(),
      status: "SENT_MANUALLY",
    },
    update: { status: "SENT_MANUALLY", failureReason: null },
  });

  return { ok: true };
}

export type InvoicePeriodOption = {
  quarterIndex: number;
  label: string;
  amount: number;
  scheduledDate: Date;
  status: string | null;
};

/**
 * Every recurring period (quarterIndex 1+) in a deal's current term from the
 * current one through the rolling horizon - not just the ones currently due
 * like computeDueLines returns, but excluding anything that's already fully
 * elapsed (not useful to hand-pick once it's long past). Used by the "marker
 * kvartal sendt manuelt" picker, for when a quarter was invoiced entirely
 * outside the system (e.g. sent directly in Dinero) and just needs to be
 * recorded here so the automated generator doesn't also try to draft it.
 */
export async function listRecurringPeriodsForDeal(dealId: string): Promise<InvoicePeriodOption[]> {
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId }, include: { invoices: true } });
  if (!deal.billingStartDate || !deal.saleAmount || !deal.bindingMonths) return [];

  const now = new Date();
  const contractEnd = addMonths(deal.billingStartDate, deal.bindingMonths);
  const until = deal.contractEndDate ?? maxDate([contractEnd, addMonths(now, ROLLING_HORIZON_MONTHS)]);
  const periods = computeBillingPeriods(deal.billingStartDate, deal.bindingMonths, until);
  const amounts = computePeriodAmounts(totalContractValue(deal), periods, deal.billingStartDate, deal.bindingMonths);
  const termInvoices = deal.invoices.filter((inv) => inv.termNumber === deal.currentTermNumber);

  return periods
    .map((period, i) => ({
      quarterIndex: period.index,
      label: invoicePeriodLabel(period.startDate),
      amount: amounts[i],
      scheduledDate: period.startDate,
      status: termInvoices.find((inv) => inv.quarterIndex === period.index)?.status ?? null,
      endDate: period.endDate,
    }))
    // Quarters that have already fully elapsed are long past being useful to
    // pick here - only the current one onward is worth choosing manually.
    // Also never offer anything before Q4 2026, regardless of a deal's real
    // billingStartDate - see INVOICING_FLOOR.
    .filter((option) => option.endDate >= now && option.scheduledDate >= INVOICING_FLOOR)
    .map(({ endDate: _endDate, ...option }) => option);
}

/**
 * Marks one specific, chosen recurring period as handled by hand outside
 * Dinero-kladden (e.g. a batch of quarters sent directly in Dinero without
 * going through this system at all) - same idea as
 * markEstablishmentSentManually, but for an admin-picked quarter instead of
 * always quarterIndex 0. Creates the tracking row if none exists yet, or
 * overwrites whatever state an existing one was in; either way the
 * automated generator will never touch this line again.
 */
export async function markPeriodSentManually(
  dealId: string,
  quarterIndex: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (quarterIndex < 1) return { ok: false, error: "Ugyldigt kvartal." };

  const periods = await listRecurringPeriodsForDeal(dealId);
  const period = periods.find((p) => p.quarterIndex === quarterIndex);
  if (!period) return { ok: false, error: "Dette kvartal findes ikke for denne deal." };

  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  await prisma.invoice.upsert({
    where: { dealId_termNumber_quarterIndex: { dealId, termNumber: deal.currentTermNumber, quarterIndex } },
    create: {
      dealId,
      termNumber: deal.currentTermNumber,
      quarterIndex,
      amount: period.amount,
      scheduledDate: period.scheduledDate,
      status: "SENT_MANUALLY",
    },
    update: { status: "SENT_MANUALLY", failureReason: null },
  });

  return { ok: true };
}

/** Looks up whether a drafted invoice has since been paid in Dinero. Only
 * applies to invoices we actually have a real Dinero guid for - see
 * markInvoicePaidManually for invoices without one (e.g. sent outside the
 * system entirely). `rawStatus` is threaded through so it stays visible
 * rather than trusted blindly, since a previous guess at the right Dinero
 * field turned out wrong. */
export async function checkInvoicePayment(
  invoiceId: string
): Promise<
  | { ok: true; paid: boolean; rawStatus: string | null; dealId: string }
  | { ok: false; error: string; dealId: string }
> {
  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  if (!invoice.dineroInvoiceGuid || invoice.dineroInvoiceGuid.startsWith("TEST-")) {
    return { ok: false, error: "Ingen rigtig Dinero-faktura at tjekke for denne linje.", dealId: invoice.dealId };
  }

  try {
    const { paid, paidDate, rawStatus } = await getInvoicePaymentStatus(invoice.dineroInvoiceGuid);
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { paidAt: paid ? (paidDate ? new Date(paidDate) : new Date()) : null },
    });
    return { ok: true, paid, rawStatus, dealId: invoice.dealId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Ukendt fejl", dealId: invoice.dealId };
  }
}

/**
 * Directly marks (or unmarks) an invoice as paid, bypassing Dinero entirely -
 * for lines sent manually outside the system (e.g. "Etablering sendt
 * manuelt"), which have no real Dinero guid for "Tjek betaling" to check.
 */
export async function markInvoicePaidManually(
  invoiceId: string,
  paid: boolean
): Promise<{ ok: true; dealId: string } | { ok: false; error: string }> {
  try {
    const invoice = await prisma.invoice.update({
      where: { id: invoiceId },
      data: { paidAt: paid ? new Date() : null },
    });
    return { ok: true, dealId: invoice.dealId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Ukendt fejl" };
  }
}

/**
 * Daily sweep (part of the same cron as invoice generation): checks every
 * drafted-or-manually-sent invoice that isn't marked paid yet against
 * Dinero, and records it as paid here the moment Dinero shows it as such.
 * Best-effort per invoice - one failing lookup (e.g. a transient Dinero
 * error) doesn't stop the rest of the sweep.
 */
export async function checkAllPendingPayments(): Promise<{ checked: number; paid: number }> {
  if (!(await isDineroConfigured())) return { checked: 0, paid: 0 };

  const invoices = await prisma.invoice.findMany({
    where: { paidAt: null, dineroInvoiceGuid: { not: null }, status: { in: ["DRAFT_CREATED", "SENT_MANUALLY"] } },
    select: { id: true },
  });

  let checked = 0;
  let paid = 0;
  for (const invoice of invoices) {
    const result = await checkInvoicePayment(invoice.id);
    if (!result.ok) continue;
    checked++;
    if (result.paid) paid++;
  }

  return { checked, paid };
}
