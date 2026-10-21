import "server-only";
import { prisma } from "@/lib/db";
import { dealName, formatDKK } from "@/lib/labels";
import { logActivity } from "@/lib/activity";

/**
 * A deal whose setup fee waits for the customer's approval (see
 * Deal.establishmentAwaitingApproval) is only set Live once the customer
 * has approved the product - so going Live is the approval: the setup fee
 * is released to the invoice run (which also never holds it back for a
 * Live deal, see computeDueLines).
 */
export async function releaseEstablishmentOnLive(
  dealId: string,
  previousStage: string,
  newStage: string,
  actorId: string
): Promise<void> {
  if (newStage !== "LIVE" || previousStage === "LIVE") return;
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  if (!deal.establishmentAwaitingApproval) return;
  await prisma.deal.update({ where: { id: dealId }, data: { establishmentAwaitingApproval: false } });
  await prisma.note.create({
    data: { dealId, authorId: actorId, body: "Sat Live = kunden har godkendt produktet - etableringen faktureres.", kind: "MANUAL" },
  });
  await logActivity({
    type: "DEAL_UPDATED",
    message: `${dealName(deal)} er godkendt og Live - etableringen (${formatDKK(deal.establishmentFee)}) faktureres`,
    actorId,
    dealId,
  });
}
