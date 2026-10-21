import { prisma } from "@/lib/db";
import { calculateCommissionAmount, calculateCommissionDueDate } from "@/lib/commission";
import { totalContractValue } from "@/lib/labels";

export async function recalcCommission(dealId: string) {
  const deal = await prisma.deal.findUniqueOrThrow({
    where: { id: dealId },
    include: { owner: true },
  });

  // Commission base is the full contract value (monthly fee x binding period) plus the establishment fee.
  const baseAmount = totalContractValue(deal) + (deal.establishmentFee ?? 0);

  if (deal.commissionExcluded || !deal.owner.isCommissionBased || !deal.soldAt || baseAmount <= 0) {
    await prisma.commission.deleteMany({ where: { dealId } });
    return;
  }
  const rate = deal.commissionRateOverride ?? deal.owner.commissionRate;
  const amount = calculateCommissionAmount(baseAmount, rate);
  const dueDate = calculateCommissionDueDate(deal.soldAt, deal.owner.payoutFrequency);

  await prisma.commission.upsert({
    where: { dealId },
    create: {
      dealId,
      sellerId: deal.ownerId,
      rate,
      baseAmount,
      amount,
      frequency: deal.owner.payoutFrequency,
      dueDate,
    },
    update: {
      sellerId: deal.ownerId,
      rate,
      baseAmount,
      amount,
      frequency: deal.owner.payoutFrequency,
      dueDate,
    },
  });
}
