import "server-only";
import { prisma } from "@/lib/db";
import { dealName } from "@/lib/labels";
import { logActivity } from "@/lib/activity";

/** The contract's rule: no concrete defects pointed out within this many
 * days of delivery (going Live) = approved. */
export const APPROVAL_DAYS = 7;

/** When a delivered (Live) product counts as approved, unless defects are pointed out first. */
export function approvalDeadline(liveAt: Date): Date {
  return new Date(liveAt.getTime() + APPROVAL_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Releases the setup fee of every deal whose 7 days after delivery have
 * passed without the customer pointing out defects - run at the start of
 * the daily invoice run, so it's billed in that same run.
 */
export async function autoApproveEstablishments(now = new Date()): Promise<number> {
  const deals = await prisma.deal.findMany({
    where: {
      establishmentAwaitingApproval: true,
      establishmentDisputedAt: null,
      liveAt: { lte: new Date(now.getTime() - APPROVAL_DAYS * 24 * 60 * 60 * 1000) },
    },
  });
  for (const deal of deals) {
    await prisma.deal.update({ where: { id: deal.id }, data: { establishmentAwaitingApproval: false } });
    await prisma.note.create({
      data: {
        dealId: deal.id,
        authorId: deal.ownerId,
        body: `Etableringen godkendt automatisk - ingen mangler påpeget inden for ${APPROVAL_DAYS} dage efter levering.`,
        kind: "MANUAL",
      },
    });
    await prisma.task.updateMany({ where: { dealId: deal.id, title: approvalTaskTitle(dealName(deal)), done: false }, data: { done: true } });
    await logActivity({
      type: "DEAL_UPDATED",
      message: `Etableringen for ${dealName(deal)} er godkendt automatisk (${APPROVAL_DAYS} dage efter levering) og faktureres`,
      dealId: deal.id,
    });
  }
  return deals.length;
}

/** Title of the reminder made when a deal awaiting approval goes Live. */
export function approvalTaskTitle(name: string): string {
  return `Er ${name} tilfredse? Fakturér etableringen`;
}

/**
 * A deal whose setup fee waits for the customer's approval (see
 * Deal.establishmentAwaitingApproval) just went Live - the product is
 * delivered, so its owner gets a task to ask whether they're happy and then
 * release the invoice. Once per deal.
 */
export async function remindApprovalOnLive(dealId: string, previousStage: string, newStage: string): Promise<void> {
  if (newStage !== "LIVE" || previousStage === "LIVE") return;
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  if (!deal.establishmentAwaitingApproval || !deal.establishmentFee) return;
  const title = approvalTaskTitle(dealName(deal));
  if (await prisma.task.findFirst({ where: { dealId, title } })) return;
  await prisma.task.create({
    data: {
      title,
      description: `Etableringen faktureres, når kunden er tilfreds - eller automatisk efter ${APPROVAL_DAYS} dage, hvis de ikke har påpeget mangler. Spørg dem: er de tilfredse, så tryk "Kunden er tilfreds - fakturér etablering" på dealen; har de mangler, så tryk "Kunden har påpeget mangler".`,
      dueDate: new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z"),
      assigneeId: deal.ownerId,
      createdById: deal.ownerId,
      dealId,
    },
  });
}
