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
import { totalContractValue } from "@/lib/labels";

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
};

function monthlyRate(deal: { saleAmount: number | null }): number {
  return deal.saleAmount ?? 0;
}

function isBillable(deal: DealForGrowth): boolean {
  return Boolean(deal.saleAmount && deal.bindingMonths);
}

export async function getGrowthDashboardData() {
  const [deals, items] = await Promise.all([
    prisma.deal.findMany(),
    prisma.dealItem.findMany({ include: { deal: { select: { stage: true, churnedAt: true } } } }),
  ]);

  const now = new Date();

  const activeDeals = deals.filter((d) => d.stage === "LIVE" && !d.churnedAt && isBillable(d));
  const pipelineDeals = deals.filter(
    (d) => (PIPELINE_STAGES as readonly string[]).includes(d.stage) && !d.churnedAt && isBillable(d)
  );
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
  const totalBookedValue = activeContractValue + pipelineContractValue + establishmentTotal;

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

  const monthlyNew = [];
  const thisMonthStart = startOfMonth(now);
  for (let i = 11; i >= 0; i--) {
    const m = subMonths(thisMonthStart, i);
    const mEnd = endOfMonth(m);
    const newDeals = deals.filter((d) => d.soldAt && isWithinInterval(d.soldAt, { start: m, end: mEnd }));
    monthlyNew.push({
      label: format(m, "MMM yyyy", { locale: da }),
      count: newDeals.length,
      newMRR: newDeals.reduce((sum, d) => sum + monthlyRate(d), 0),
    });
  }

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

  return {
    activeCount: activeDeals.length,
    pipelineCount: pipelineDeals.length,
    totalCount: activeDeals.length + pipelineDeals.length,
    expiredCount,
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
    totalBookedValue,
    avgBindingMonths,
    avgContractValue,
    ltv,
    maxMonthlyPrice,
    concentration,
    monthlyNew,
    serviceMix,
  };
}
