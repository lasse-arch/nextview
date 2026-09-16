import { prisma } from "@/lib/db";
import { calculateCommissionAmount, calculateCommissionDueDate } from "@/lib/commission";

export async function recalcCommission(dealId: string) {
  const deal = await prisma.deal.findUniqueOrThrow({
    where: { id: dealId },
    include: { owner: true },
  });

  if (!deal.owner.isCommissionBased || !deal.saleAmount || !deal.soldAt) {
    await prisma.commission.deleteMany({ where: { dealId } });
    return;
  }

  // Commission base includes the establishment fee, not just the recurring value.
  const baseAmount = deal.saleAmount + (deal.establishmentFee ?? 0);
  const amount = calculateCommissionAmount(baseAmount, deal.owner.commissionRate);
  const dueDate = calculateCommissionDueDate(deal.soldAt, deal.owner.payoutFrequency);

  await prisma.commission.upsert({
    where: { dealId },
    create: {
      dealId,
      sellerId: deal.ownerId,
      rate: deal.owner.commissionRate,
      baseAmount,
      amount,
      frequency: deal.owner.payoutFrequency,
      dueDate,
    },
    update: {
      sellerId: deal.ownerId,
      rate: deal.owner.commissionRate,
      baseAmount,
      amount,
      frequency: deal.owner.payoutFrequency,
      dueDate,
    },
  });
}
