import { prisma } from "@/lib/db";
import { startOfMonth, subMonths, isWithinInterval, endOfMonth, format } from "date-fns";
import { da } from "date-fns/locale";
import { totalContractValue, contractedContractValue } from "@/lib/labels";

const PIPELINE_STAGES = [
  "LEAD",
  "CONTACTED",
  "MEETING_BOOKED",
  "CONTRACT_SENT",
  "CONTRACT_SIGNED",
  "FILMED",
] as const;

const FUNNEL_STAGES = [...PIPELINE_STAGES, "LIVE"] as const;

/** The "Aktiv pipeline" KPI only counts deals that have actually had a meeting booked or further - not raw leads/contacted. */
const ACTIVE_PIPELINE_STAGES = ["MEETING_BOOKED", "CONTRACT_SENT", "CONTRACT_SIGNED", "FILMED"] as const;

/**
 * "Solgt" = has a signed contract (Live, or signed and on its way to Live).
 * This must stay identical to the growth dashboard's `soldStages`
 * (src/lib/growth-dashboard-data.ts) - the two pages show the same "total
 * sold" figure and must be computed the same way.
 */
const SOLD_STAGES = ["LIVE", "CONTRACT_SIGNED", "FILMED"] as const;

export type FunnelBar = { stage: string; label: string; count: number; value: number };
export type MonthBar = { label: string; value: number };
export type SellerRow = {
  id: string;
  name: string;
  isCommissionBased: boolean;
  wonCount: number;
  wonValue: number;
  commissionPending: number;
  commissionPaid: number;
};
export type InvoiceStatusRow = { status: string; count: number };

/** Pass an ownerId to scope the whole dashboard to one seller's own deals/commission (used for non-admins). */
export async function getDashboardData(ownerId?: string) {
  const [deals, commissions, invoices] = await Promise.all([
    prisma.deal.findMany({ where: ownerId ? { ownerId } : {}, include: { owner: true } }),
    prisma.commission.findMany({ where: ownerId ? { sellerId: ownerId } : {}, include: { seller: true } }),
    prisma.invoice.findMany({ where: ownerId ? { deal: { ownerId } } : {} }),
  ]);

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  // Full contract value: the monthly fee over its whole binding period, plus
  // the one-time establishment fee.
  const soldTotalValue = (d: { establishmentFee: number | null; saleAmount: number | null; bindingMonths: number | null }) =>
    totalContractValue(d) + (d.establishmentFee ?? 0);

  const activePipeline = deals.filter((d) => (ACTIVE_PIPELINE_STAGES as readonly string[]).includes(d.stage));
  const pipelineValue = activePipeline.reduce((sum, d) => sum + soldTotalValue(d), 0);

  // "Solgt" means having a signed contract (signed, filmed, or live) - a
  // churned customer still counts here (they just don't contribute ongoing
  // MRR anymore, see below). This must match the growth dashboard's
  // "Samlet booket værdi" definition so the two numbers agree.
  const soldDeals = deals.filter((d) => (SOLD_STAGES as readonly string[]).includes(d.stage));
  // Total contracted value (see contractedContractValue in labels.ts): the
  // months actually contracted for - exact for a churned or already-notified
  // deal, or every full binding term tacitly renewed through so far for a
  // still-open one - times the monthly price, plus the one-off establishment
  // fee.
  const soldContribution = (d: Parameters<typeof contractedContractValue>[0] & { establishmentFee: number | null }) =>
    (d.establishmentFee ?? 0) + contractedContractValue(d, now);
  const soldValue = soldDeals.reduce((sum, d) => sum + soldContribution(d), 0);
  const soldBreakdown = soldDeals
    .map((d) => ({
      id: d.id,
      name: d.displayName || d.companyName,
      stage: d.stage,
      churned: Boolean(d.churnedAt),
      mrr: d.saleAmount ?? 0,
      bindingMonths: d.bindingMonths ?? 0,
      contractValue: contractedContractValue(d, now),
      establishmentFee: d.establishmentFee ?? 0,
      contribution: soldContribution(d),
    }))
    .sort((a, b) => b.contribution - a.contribution);

  const soldThisMonth = deals.filter(
    (d) => d.soldAt && isWithinInterval(d.soldAt, { start: monthStart, end: monthEnd })
  );
  const soldThisMonthValue = soldThisMonth.reduce((sum, d) => sum + soldTotalValue(d), 0);
  const soldThisMonthDeals = soldThisMonth
    .map((d) => ({ id: d.id, name: d.displayName || d.companyName, value: soldTotalValue(d) }))
    .sort((a, b) => b.value - a.value);

  const commissionOwed = commissions
    .filter((c) => c.status === "PENDING" || c.status === "DUE")
    .reduce((sum, c) => sum + c.amount, 0);

  const failedInvoices = invoices.filter((i) => i.status === "FAILED").length;

  // Establishment fees for deals sold this month (same deal set as "Solgt denne måned"),
  // excluding ones with no establishment fee at all - a deal with a 0 kr. fee
  // isn't part of "who was sold an etableringspris this month".
  const soldWithEstablishmentFee = soldThisMonth.filter((d) => (d.establishmentFee ?? 0) > 0);
  const establishmentFeeTotal = soldWithEstablishmentFee.reduce((sum, d) => sum + (d.establishmentFee ?? 0), 0);
  const establishmentFeeDeals = soldWithEstablishmentFee
    .map((d) => ({ id: d.id, name: d.displayName || d.companyName, value: d.establishmentFee ?? 0 }))
    .sort((a, b) => b.value - a.value);

  const lostDeals = deals.filter((d) => d.stage === "LOST");
  const lostValue = lostDeals.reduce((sum, d) => sum + totalContractValue(d), 0);

  const funnel: FunnelBar[] = FUNNEL_STAGES.map((stage) => {
    const stageDeals = deals.filter((d) => d.stage === stage);
    return {
      stage,
      label: stage,
      count: stageDeals.length,
      value: stageDeals.reduce((sum, d) => sum + totalContractValue(d), 0),
    };
  });

  const monthly: MonthBar[] = [];
  for (let i = 2; i >= 0; i--) {
    const m = subMonths(monthStart, i);
    const mEnd = endOfMonth(m);
    const value = deals
      .filter((d) => d.soldAt && isWithinInterval(d.soldAt, { start: m, end: mEnd }))
      .reduce((sum, d) => sum + soldTotalValue(d), 0);
    monthly.push({ label: format(m, "MMM", { locale: da }), value });
  }

  const sellerMap = new Map<string, SellerRow>();
  for (const d of deals) {
    if (!sellerMap.has(d.ownerId)) {
      sellerMap.set(d.ownerId, {
        id: d.ownerId,
        name: d.owner.name,
        isCommissionBased: d.owner.isCommissionBased,
        wonCount: 0,
        wonValue: 0,
        commissionPending: 0,
        commissionPaid: 0,
      });
    }
    if (d.stage === "LIVE" && !d.churnedAt) {
      const row = sellerMap.get(d.ownerId)!;
      row.wonCount++;
      row.wonValue += totalContractValue(d);
    }
  }
  for (const c of commissions) {
    const row = sellerMap.get(c.sellerId);
    if (!row) continue;
    if (c.status === "PAID") row.commissionPaid += c.amount;
    else row.commissionPending += c.amount;
  }
  const sellers = Array.from(sellerMap.values()).sort((a, b) => b.wonValue - a.wonValue);

  const invoiceStatusOrder = ["DRAFT_CREATED", "PENDING", "FAILED", "IMPORTED"];
  const invoiceStatuses: InvoiceStatusRow[] = invoiceStatusOrder.map((status) => ({
    status,
    count: invoices.filter((i) => i.status === status).length,
  }));

  return {
    pipelineValue,
    pipelineCount: activePipeline.length,
    soldValue,
    soldCount: soldDeals.length,
    soldBreakdown,
    soldThisMonthValue,
    soldThisMonthCount: soldThisMonth.length,
    soldThisMonthDeals,
    commissionOwed,
    establishmentFeeTotal,
    establishmentFeeCount: soldWithEstablishmentFee.length,
    establishmentFeeDeals,
    failedInvoices,
    lostValue,
    lostCount: lostDeals.length,
    funnel,
    monthly,
    sellers,
    invoiceStatuses,
  };
}
