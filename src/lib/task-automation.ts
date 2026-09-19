import { addDays } from "date-fns";
import { prisma } from "@/lib/db";
import { contractProductsToDealItems, type ContractProducts } from "@/lib/contract-template-data";

/**
 * One "Aflever X" delivery task per product on a just-signed contract,
 * assigned to the deal's owner - so signing a contract automatically lines
 * up the team's delivery work instead of relying on someone remembering to
 * add it to the board by hand.
 */
export async function createDeliveryTasksForSignedContract(
  dealId: string,
  ownerId: string,
  products: ContractProducts
): Promise<void> {
  const items = contractProductsToDealItems(products);
  if (items.length === 0) return;

  await prisma.task.createMany({
    data: items.map((item) => ({
      title: `Aflever ${item.productType}`,
      assigneeId: ownerId,
      createdById: ownerId,
      dealId,
    })),
  });
}

/** A one-week-out reminder for whoever just sent a contract, to chase the customer for a reply. */
export async function createContractFollowUpTask(dealId: string, senderId: string): Promise<void> {
  await prisma.task.create({
    data: {
      title: "Opfølgning på kontrakt tilbud",
      assigneeId: senderId,
      createdById: senderId,
      dealId,
      dueDate: addDays(new Date(), 7),
    },
  });
}
