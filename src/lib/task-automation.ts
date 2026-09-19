import { addDays } from "date-fns";
import { prisma } from "@/lib/db";
import { contractProductsToDealItems, type ContractProducts } from "@/lib/contract-template-data";

/**
 * One "Aflever X" delivery task per product on a just-signed contract,
 * landing unassigned ("Fælles") under the deal - the seller isn't usually
 * who delivers the product, so it's left for whoever picks it up (or gets
 * bulk-reassigned) rather than defaulting to the deal's owner.
 */
export async function createDeliveryTasksForSignedContract(
  dealId: string,
  createdById: string,
  products: ContractProducts
): Promise<void> {
  const items = contractProductsToDealItems(products);
  if (items.length === 0) return;

  await prisma.task.createMany({
    data: items.map((item) => ({
      title: `Aflever ${item.productType}`,
      createdById,
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
