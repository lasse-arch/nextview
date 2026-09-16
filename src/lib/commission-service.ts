import { prisma } from "@/lib/db";
import { calculateCommissionAmount, calculateCommissionDueDate } from "@/lib/commission";
import { totalContractValue } from "@/lib/labels";

export async function recalcCommission(dealId: string) {
  const deal = await prisma.deal.findUniqueOrThrow({
    where: { id: dealId },
    include: { owner: true },
  });

  if (!deal.owner.isCommissionBased || !deal.saleAmount || !deal.soldAt) {
    await prisma.commission.deleteMany({ where: { dealId } });
    return;
  }

  // Commission base is the full contract value (monthly fee x binding period) plus the establishment fee.
  const baseAmount = totalContractValue(deal) + (deal.establishmentFee ?? 0);
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
