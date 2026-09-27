import { prisma } from "@/lib/db";
import { getSemiMonthlyPeriod } from "@/lib/commission";
import { dealName } from "@/lib/labels";

const VAT_RATE = 1.25;

export type CommissionPeriodReminder = {
  periodStart: string;
  periodEnd: string;
  amount: number;
  amountInclVat: number;
  deals: { id: string; name: string; amount: number }[];
};

/**
 * For a SEMI_MONTHLY commission-based seller (see Gustav's contract - commission
 * settled twice a month, invoiced by the seller themselves rather than paid via
 * payroll): the current 1st-15th/16th-end period and what's accrued and still
 * unpaid in it, so the dashboard can remind them to send an invoice for
 * "provision + moms" covering exactly that period.
 */
export async function getCommissionPeriodReminder(user: {
  id: string;
  isCommissionBased: boolean;
  payoutFrequency: string;
}): Promise<CommissionPeriodReminder | null> {
  if (!user.isCommissionBased || user.payoutFrequency !== "SEMI_MONTHLY") return null;

  const period = getSemiMonthlyPeriod(new Date());

  const commissions = await prisma.commission.findMany({
    where: {
      sellerId: user.id,
      status: { not: "PAID" },
      dueDate: { gte: period.start, lte: period.end },
    },
    include: { deal: true },
  });

  return {
    periodStart: period.start.toISOString(),
    periodEnd: period.end.toISOString(),
    amount: commissions.reduce((sum, c) => sum + c.amount, 0),
    amountInclVat: Math.round(commissions.reduce((sum, c) => sum + c.amount, 0) * VAT_RATE),
    deals: commissions.map((c) => ({ id: c.dealId, name: dealName(c.deal), amount: c.amount })),
  };
}
