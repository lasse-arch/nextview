import "server-only";
import { prisma } from "@/lib/db";
import { dealName } from "@/lib/labels";

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
      description:
        "Etableringen faktureres først, når kunden har produktet og er tilfreds. Spørg dem - og tryk så \"Kunden er tilfreds - fakturér etablering\" på dealen.",
      dueDate: new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z"),
      assigneeId: deal.ownerId,
      createdById: deal.ownerId,
      dealId,
    },
  });
}
