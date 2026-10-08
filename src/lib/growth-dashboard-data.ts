import { prisma } from "@/lib/db";
import {
  startOfMonth,
  subMonths,
  endOfMonth,
  isWithinInterval,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  format,
} from "date-fns";
import { da } from "date-fns/locale";
import { totalContractValue, contractedContractValue, dealName } from "@/lib/labels";

const PIPELINE_STAGES = ["CONTRACT_SIGNED", "FILMED"] as const;
const RISK_WINDOWS = [30, 60, 90] as const;

type DealForGrowth = {
  stage: string;
  saleAmount: number | null;
  bindingMonths: number | null;
  establishmentFee: number | null;
  billingStartDate: Date | null;
  liveAt: Date | null;
  contractSignedAt: Date | null;
  churnedAt: Date | null;
  contractEndDate: Date | null;
  terminationNoticeAt: Date | null;
};

function monthlyRate(deal: { saleAmount: number | null }): number {
  return deal.saleAmount ?? 0;
}

function isBillable(deal: DealForGrowth): boolean {
  return Boolean(deal.saleAmount && deal.bindingMonths);
}

export type PaymentReportRow = { key: string; id: string; name: string; stage: string; note: string; amount: number };

/** "Faktura 123 · forfald 12.10.2026 (overskredet)" - what an unpaid invoice row says in a report. */
function invoiceNote(inv: { dineroInvoiceNumber: string | null; dueDate: Date | null; status: string }, now: Date): string {
  const parts = [inv.dineroInvoiceNumber ? `Faktura ${inv.dineroInvoiceNumber}` : inv.status === "SENT_MANUALLY" ? "Sendt manuelt" : "Kladde"];
  if (inv.dueDate) {
    const due = inv.dueDate.toLocaleDateString("da-DK", { timeZone: "Europe/Copenhagen" });
    parts.push(inv.dueDate < now ? `forfaldt ${due}` : `forfald ${due}`);
  }
  return parts.join(" · ");
}

export async function getGrowthDashboardData() {
  const [deals, items, invoices] = await Promise.all([
    prisma.deal.findMany(),
    prisma.dealItem.findMany({ include: { deal: { select: { stage: true, churnedAt: true } } } }),
    prisma.invoice.findMany({
      select: {
        id: true,
        dealId: true,
        amount: true,
        status: true,
        paidAt: true,
        quarterIndex: true,
        dineroInvoiceNumber: true,
        dueDate: true,
      },
    }),
  ]);

  const now = new Date();

  // Customer *counts* (activeCount/pipelineCount below) include every
  // non-churned deal in that stage, whether or not price/binding has been
  // filled in yet - a deal doesn't stop being "in the pipeline" just
  // because nobody's typed in the monthly price yet. Only the *financial*
  // metrics (MRR, contract value, LTV, risk, etc.) need a real price and
  // binding period to mean anything, so those use the narrower
  // isBillable() filter below. This keeps activeCount + pipelineCount +
  // expiredCount always equal to totalCount, with no unexplained gap.
  const allActiveDeals = deals.filter((d) => d.stage === "LIVE" && !d.churnedAt);
  const allPipelineDeals = deals.filter((d) => (PIPELINE_STAGES as readonly string[]).includes(d.stage) && !d.churnedAt);
  const activeDeals = allActiveDeals.filter(isBillable);
  const pipelineDeals = allPipelineDeals.filter(isBillable);
  const expiredCount = deals.filter((d) => d.churnedAt).length;

  // "Solgt" (has a signed contract - signed, filmed, or live) is a lower
  // bar than "billable" (also needs a recurring monthly fee + binding) - a
  // customer who only ever paid a one-off establishment fee, or who has
  // since churned, is still "solgt" and their establishment fee still
  // counts in "Opstart i alt", even though they're excluded from MRR/ARR
  // and the other billable-only metrics above. This must match the main
  // dashboard's SOLD_STAGES (src/lib/dashboard-data.ts) so "Solgt i alt"
  // and "Samlet booket værdi" always agree.
  const soldStages = ["LIVE", ...PIPELINE_STAGES] as readonly string[];
  const soldDeals = deals.filter((d) => soldStages.includes(d.stage));

  const activeMRR = activeDeals.reduce((sum, d) => sum + monthlyRate(d), 0);
  const pipelineMRR = pipelineDeals.reduce((sum, d) => sum + monthlyRate(d), 0);
  const totalMRR = activeMRR + pipelineMRR;
  const arr = activeMRR * 12;
  const quarterlyBilling = activeMRR * 3;
  const avgMRRPerActive = activeDeals.length > 0 ? activeMRR / activeDeals.length : 0;

  const risk = RISK_WINDOWS.map((days) => {
    const atRisk = activeDeals.filter((d) => {
      if (!d.contractEndDate) return false;
      const daysUntil = differenceInCalendarDays(d.contractEndDate, now);
      return daysUntil >= 0 && daysUntil <= days;
    });
    return {
      days,
      count: atRisk.length,
      mrr: atRisk.reduce((sum, d) => sum + monthlyRate(d), 0),
    };
  });

  const activeContractValue = activeDeals.reduce((sum, d) => sum + totalContractValue(d), 0);
  const realizedToDate = activeDeals.reduce((sum, d) => {
    if (!d.billingStartDate || !d.bindingMonths || !d.saleAmount) return sum;
    const elapsedMonths = Math.max(0, differenceInCalendarMonths(now, d.billingStartDate));
    return sum + d.saleAmount * Math.min(elapsedMonths, d.bindingMonths);
  }, 0);
  const remainingContractValue = activeContractValue - realizedToDate;
  const pipelineContractValue = pipelineDeals.reduce((sum, d) => sum + totalContractValue(d), 0);
  const establishmentTotal = soldDeals.reduce((sum, d) => sum + (d.establishmentFee ?? 0), 0);
  // Total contracted value across every sold deal (active, pipeline, or
  // churned) - see contractedContractValue in labels.ts. This is what
  // "Samlet booket værdi" is built from below, and must match the main
  // dashboard's soldValue (src/lib/dashboard-data.ts) exactly so the two
  // totals always agree.
  const contractedContractTotal = soldDeals.reduce((sum, d) => sum + contractedContractValue(d, now), 0);
  const totalBookedValue = establishmentTotal + contractedContractTotal;

  const billableCustomers = [...activeDeals, ...pipelineDeals];
  const avgBindingMonths =
    billableCustomers.length > 0
      ? billableCustomers.reduce((sum, d) => sum + (d.bindingMonths ?? 0), 0) / billableCustomers.length
      : 0;
  const avgContractValue =
    billableCustomers.length > 0
      ? billableCustomers.reduce((sum, d) => sum + totalContractValue(d), 0) / billableCustomers.length
      : 0;
  const avgEstablishmentFeeActive =
    activeDeals.length > 0
      ? activeDeals.reduce((sum, d) => sum + (d.establishmentFee ?? 0), 0) / activeDeals.length
      : 0;
  const ltv = avgMRRPerActive * avgBindingMonths + avgEstablishmentFeeActive;
  const maxMonthlyPrice = activeDeals.reduce((max, d) => Math.max(max, monthlyRate(d)), 0);
  const concentration = activeMRR > 0 ? (maxMonthlyPrice / activeMRR) * 100 : 0;

  /**
   * "Ny kunde" can mean two different moments - when the contract was signed
   * (soldAt, same date as "Underskrevet" now that the two are kept in sync -
   * see src/lib/actions/deals.ts) or when the customer actually went live/was
   * delivered (liveAt). Both are tracked in parallel so the page can offer a
   * toggle rather than picking one.
   */
  function monthlySeries(pickDate: (d: (typeof deals)[number]) => Date | null) {
    const thisMonthStart = startOfMonth(now);
    const series = [];
    for (let i = 11; i >= 0; i--) {
      const m = subMonths(thisMonthStart, i);
      const mEnd = endOfMonth(m);
      const newDeals = deals.filter((d) => {
        const date = pickDate(d);
        return date && isWithinInterval(date, { start: m, end: mEnd });
      });
      series.push({
        label: format(m, "MMM yyyy", { locale: da }),
        count: newDeals.length,
        newMRR: newDeals.reduce((sum, d) => sum + monthlyRate(d), 0),
      });
    }
    return series;
  }
  const monthlyNewBySignedDate = monthlySeries((d) => d.soldAt);
  const monthlyNewByLiveDate = monthlySeries((d) => d.liveAt);

  const nonChurnedItems = items.filter((i) => !i.deal.churnedAt && !i.isFree && i.amount);
  const serviceMap = new Map<string, { count: number; total: number }>();
  for (const item of nonChurnedItems) {
    const entry = serviceMap.get(item.productType) ?? { count: 0, total: 0 };
    entry.count += 1;
    entry.total += item.amount ?? 0;
    serviceMap.set(item.productType, entry);
  }
  const serviceMix = Array.from(serviceMap.entries())
    .map(([productType, v]) => ({ productType, ...v }))
    .sort((a, b) => b.total - a.total);

  // Betaling - sold-but-not-billing-yet visibility: who's holding up their
  // own first invoice by not having gone live yet, and who HAS gone live but
  // has somehow never gotten an invoice at all (a gap in the automated
  // generator, not a scheduling delay - see runQuarterlyInvoiceGeneration).
  // Excludes anyone already churned or already given/received a termination
  // notice (terminationNoticeAt set) - someone on their way out isn't an
  // invoicing gap to chase - and anyone with neither an establishment fee
  // nor a recurring price (a free/trial deal was never going to be invoiced
  // in the first place, so having no invoice isn't a gap for them either).
  const invoicesByDeal = new Map<string, typeof invoices>();
  for (const inv of invoices) {
    const list = invoicesByDeal.get(inv.dealId);
    if (list) list.push(inv);
    else invoicesByDeal.set(inv.dealId, [inv]);
  }
  const stillActive = (d: DealForGrowth) => !d.churnedAt && !d.terminationNoticeAt;
  const everBillable = (d: DealForGrowth) => Boolean(d.establishmentFee) || Boolean(d.saleAmount);

  const notLiveYet = soldDeals
    .filter((d) => d.stage !== "LIVE" && stillActive(d) && everBillable(d))
    .map((d) => ({ id: d.id, name: dealName(d), stage: d.stage, soldAt: d.soldAt }));
  const liveWithoutInvoice = soldDeals
    .filter((d) => d.stage === "LIVE" && stillActive(d) && everBillable(d) && !invoicesByDeal.has(d.id))
    .map((d) => ({ id: d.id, name: dealName(d), liveAt: d.liveAt }));
  // "Udestående" = an invoice that was actually issued (drafted in Dinero or
  // sent by hand) and isn't marked paid yet - a still-PENDING (not due/drafted
  // yet), FAILED (never actually reached the customer) or IMPORTED
  // (pre-CRM, handled by the old system) row isn't money we're owed on a
  // real issued invoice, so those are excluded from the sum.
  const outstandingInvoices = invoices.filter(
    (inv) => !inv.paidAt && (inv.status === "DRAFT_CREATED" || inv.status === "SENT_MANUALLY")
  );

  // Etablering vi mangler at modtage: for every still-active deal with a
  // real establishment fee, whatever of it hasn't been invoiced yet at all
  // (no quarterIndex-0 Invoice row) PLUS whatever was invoiced but isn't
  // paid yet - new customers are the usual source of this, since their
  // establishment fee is the very first thing that's supposed to be billed.
  const establishmentInvoiceByDeal = new Map<string, (typeof invoices)[number]>();
  for (const inv of invoices) {
    if (inv.quarterIndex === 0) establishmentInvoiceByDeal.set(inv.dealId, inv);
  }
  let missingEstablishmentTotal = 0;
  let missingEstablishmentCount = 0;
  const missingEstablishment: PaymentReportRow[] = [];
  for (const d of soldDeals) {
    if (!stillActive(d) || !d.establishmentFee) continue;
    const inv = establishmentInvoiceByDeal.get(d.id);
    if (!inv) {
      missingEstablishmentTotal += d.establishmentFee;
      missingEstablishmentCount++;
      missingEstablishment.push({ key: d.id, id: d.id, name: dealName(d), stage: d.stage, note: "Ikke faktureret", amount: d.establishmentFee });
    } else if (!inv.paidAt && (inv.status === "DRAFT_CREATED" || inv.status === "SENT_MANUALLY")) {
      missingEstablishmentTotal += inv.amount;
      missingEstablishmentCount++;
      missingEstablishment.push({ key: d.id, id: d.id, name: dealName(d), stage: d.stage, note: invoiceNote(inv, now), amount: inv.amount });
    }
  }
  missingEstablishment.sort((a, b) => a.name.localeCompare(b.name, "da"));

  // The Udestående report: one row per unpaid invoice, oldest due date first.
  const dealById = new Map(deals.map((d) => [d.id, d]));
  const outstanding: PaymentReportRow[] = [...outstandingInvoices]
    .sort((a, b) => (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity))
    .map((inv) => {
      const deal = dealById.get(inv.dealId);
      return {
        key: inv.id,
        id: inv.dealId,
        name: deal ? dealName(deal) : "Ukendt kunde",
        stage: deal?.stage ?? "",
        note: invoiceNote(inv, now),
        amount: inv.amount,
      };
    });

  const paymentStatus = {
    notLiveYet,
    liveWithoutInvoice,
    outstanding,
    missingEstablishment,
    outstandingCount: outstandingInvoices.length,
    outstandingTotal: outstandingInvoices.reduce((sum, inv) => sum + inv.amount, 0),
    missingEstablishmentCount,
    missingEstablishmentTotal,
  };

  // Backs the "Rapport" drill-down on each of the four Kunder stat tiles -
  // same underlying deal sets as the counts right below, just mapped down to
  // what a customer list needs to link out and tell deals apart by stage.
  const toCustomerList = (list: typeof deals, note?: (d: (typeof deals)[number]) => string) =>
    list
      .map((d) => ({ id: d.id, name: dealName(d), stage: d.stage, note: note?.(d) }))
      .sort((a, b) => a.name.localeCompare(b.name, "da"));
  const activeCustomers = toCustomerList(allActiveDeals);
  const pipelineCustomers = toCustomerList(allPipelineDeals);
  const allCustomers = toCustomerList(soldDeals);
  const expiredCustomers = toCustomerList(
    deals.filter((d) => d.churnedAt),
    (d) => `Opsagt ${d.churnedAt ? d.churnedAt.toLocaleDateString("da-DK") : ""}`
  );

  return {
    paymentStatus,
    // Counts every non-churned deal in the stage, billable or not - see the
    // comment above allActiveDeals/allPipelineDeals for why this differs
    // from activeDeals/pipelineDeals (used for MRR below).
    activeCount: allActiveDeals.length,
    pipelineCount: allPipelineDeals.length,
    activeCustomers,
    pipelineCustomers,
    allCustomers,
    // Matches the main dashboard's soldCount exactly (src/lib/dashboard-data.ts) -
    // all sold deals, including churned and ones without a recurring MRR, not
    // just the billable active+pipeline subset above. Always equals
    // activeCount + pipelineCount + expiredCount.
    totalCount: soldDeals.length,
    expiredCount,
    expiredCustomers,
    activeMRR,
    pipelineMRR,
    totalMRR,
    arr,
    quarterlyBilling,
    avgMRRPerActive,
    risk,
    activeContractValue,
    realizedToDate,
    remainingContractValue,
    pipelineContractValue,
    establishmentTotal,
    contractedContractTotal,
    totalBookedValue,
    avgBindingMonths,
    avgContractValue,
    ltv,
    maxMonthlyPrice,
    concentration,
    monthlyNewBySignedDate,
    monthlyNewByLiveDate,
    serviceMix,
  };
}
