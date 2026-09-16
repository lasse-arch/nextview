import { prisma } from "@/lib/db";
import { startOfMonth, subMonths, isWithinInterval, endOfMonth, format } from "date-fns";
import { da } from "date-fns/locale";

const PIPELINE_STAGES = [
  "LEAD",
  "CONTACTED",
  "MEETING_BOOKED",
  "CONTRACT_SENT",
  "CONTRACT_SIGNED",
  "FILMED",
] as const;

const FUNNEL_STAGES = [...PIPELINE_STAGES, "LIVE"] as const;

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

export async function getDashboardData() {
  const [deals, commissions, invoices] = await Promise.all([
    prisma.deal.findMany({ include: { owner: true } }),
    prisma.commission.findMany({ include: { seller: true } }),
    prisma.invoice.findMany(),
  ]);

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const activePipeline = deals.filter((d) => (PIPELINE_STAGES as readonly string[]).includes(d.stage));
  const pipelineValue = activePipeline.reduce((sum, d) => sum + (d.saleAmount ?? 0), 0);

  const liveCustomers = deals.filter((d) => d.stage === "LIVE" && !d.churnedAt);
  const liveValue = liveCustomers.reduce((sum, d) => sum + (d.saleAmount ?? 0), 0);

  const soldThisMonth = deals.filter(
    (d) => d.soldAt && isWithinInterval(d.soldAt, { start: monthStart, end: monthEnd })
  );
  const soldThisMonthValue = soldThisMonth.reduce((sum, d) => sum + (d.saleAmount ?? 0), 0);

  const commissionOwed = commissions
    .filter((c) => c.status === "PENDING" || c.status === "DUE")
    .reduce((sum, c) => sum + c.amount, 0);

  const failedInvoices = invoices.filter((i) => i.status === "FAILED").length;

  const lostDeals = deals.filter((d) => d.stage === "LOST");
  const lostValue = lostDeals.reduce((sum, d) => sum + (d.saleAmount ?? 0), 0);

  const funnel: FunnelBar[] = FUNNEL_STAGES.map((stage) => {
    const stageDeals = deals.filter((d) => d.stage === stage);
    return {
      stage,
      label: stage,
      count: stageDeals.length,
      value: stageDeals.reduce((sum, d) => sum + (d.saleAmount ?? 0), 0),
    };
  });

  const monthly: MonthBar[] = [];
  for (let i = 5; i >= 0; i--) {
    const m = subMonths(monthStart, i);
    const mEnd = endOfMonth(m);
    const value = deals
      .filter((d) => d.soldAt && isWithinInterval(d.soldAt, { start: m, end: mEnd }))
      .reduce((sum, d) => sum + (d.saleAmount ?? 0), 0);
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
      row.wonValue += d.saleAmount ?? 0;
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
    liveValue,
    liveCount: liveCustomers.length,
    soldThisMonthValue,
    soldThisMonthCount: soldThisMonth.length,
    commissionOwed,
    failedInvoices,
    lostValue,
    lostCount: lostDeals.length,
    funnel,
    monthly,
    sellers,
    invoiceStatuses,
  };
}
