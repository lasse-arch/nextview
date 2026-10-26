import "server-only";
import { prisma } from "@/lib/db";
import { getSettingValue } from "@/lib/integration-settings";

/*
 * When does a sale start making money? A sale costs at once - the seller's
 * commission (paid shortly after the sale) - and pays back over time: the
 * establishment fee when the customer goes live, then the monthly fee. Our
 * own hours are left out. Break-even is the month the
 * customer's payments have covered the costs, the running cost per customer
 * included. An estimate from the contract (not the invoices), so it can be
 * read for a sale that isn't live yet as well.
 */

export type BreakEvenSettings = { monthlyCost: number };

export async function breakEvenSettings(): Promise<BreakEvenSettings> {
  return { monthlyCost: Number(await getSettingValue("BREAKEVEN_MONTHLY_COST")) || 0 };
}

export type BreakEvenRow = {
  dealId: string;
  name: string;
  seller: string;
  sellerId: string;
  monthly: number;
  establishment: number;
  bindingMonths: number;
  commission: number;
  /** What the sale costs before it pays anything (the commission). */
  upfront: number;
  /** Months from start until the payments have covered the costs (0 = at once; null = never, the monthly fee doesn't cover the running cost). */
  breakEvenMonths: number | null;
  /** When billing started (live) - null while the sale isn't live yet. */
  start: Date | null;
  breakEvenAt: Date | null;
  /** Earned so far, after all costs (negative = not paid back yet). */
  resultNow: number;
  /** After all costs over the binding period. */
  resultOverBinding: number;
  status: "plus" | "paying-back" | "not-started" | "lost" | "never";
  churnedAt: Date | null;
};

const DAYS_PER_MONTH = 30.44;
const addMonths = (d: Date, m: number) => new Date(d.getTime() + m * DAYS_PER_MONTH * 86_400_000);

/** Break-even for every sale with a commission (all sellers, or one). */
export async function breakEvenRows(sellerId?: string): Promise<{ rows: BreakEvenRow[]; settings: BreakEvenSettings }> {
  const settings = await breakEvenSettings();
  const commissions = await prisma.commission.findMany({
    where: sellerId ? { sellerId } : {},
    include: {
      seller: { select: { name: true } },
      deal: {
        select: {
          id: true,
          companyName: true,
          displayName: true,
          saleAmount: true,
          establishmentFee: true,
          bindingMonths: true,
          billingStartDate: true,
          liveAt: true,
          churnedAt: true,
        },
      },
    },
  });
  const now = new Date();

  const rows = commissions.map((c): BreakEvenRow => {
    const d = c.deal;
    const monthly = d.saleAmount ?? 0;
    const establishment = d.establishmentFee ?? 0;
    const bindingMonths = d.bindingMonths ?? 1;
    const upfront = c.amount;
    const net = monthly - settings.monthlyCost;
    const breakEvenMonths = establishment >= upfront ? 0 : net > 0 ? Math.ceil((upfront - establishment) / net) : null;
    const start = d.billingStartDate ?? d.liveAt ?? null;
    const end = d.churnedAt && d.churnedAt < now ? d.churnedAt : now;
    const elapsed = start ? Math.max(0, (end.getTime() - start.getTime()) / (DAYS_PER_MONTH * 86_400_000)) : 0;
    const resultNow = start ? Math.round(establishment + net * Math.floor(elapsed) - upfront) : -upfront;
    const resultOverBinding = Math.round(establishment + net * bindingMonths - upfront);
    const status: BreakEvenRow["status"] =
      d.churnedAt && resultNow < 0 ? "lost" : !start ? "not-started" : breakEvenMonths == null ? "never" : resultNow >= 0 ? "plus" : "paying-back";
    return {
      dealId: d.id,
      name: d.displayName || d.companyName,
      seller: c.seller.name,
      sellerId: c.sellerId,
      monthly,
      establishment,
      bindingMonths,
      commission: c.amount,
      upfront,
      breakEvenMonths,
      start,
      breakEvenAt: start && breakEvenMonths != null ? addMonths(start, breakEvenMonths) : null,
      resultNow,
      resultOverBinding,
      status,
      churnedAt: d.churnedAt,
    };
  });
  return { rows, settings };
}
