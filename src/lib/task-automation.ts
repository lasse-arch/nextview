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

const CONTRACT_FOLLOW_UP_TITLE = "Opfølgning på kontrakt tilbud";

/**
 * A one-week-out reminder to chase the customer for a reply, assigned to the
 * deal's owner (not necessarily whoever clicked send - an admin can send on
 * someone else's deal). Resending a contract (e.g. an edit the same day)
 * replaces any still-open follow-up from the previous send instead of piling
 * up a second one for the same deal.
 */
export async function createContractFollowUpTask(dealId: string, assigneeId: string, createdById: string): Promise<void> {
  await prisma.$transaction([
    prisma.task.deleteMany({ where: { dealId, title: CONTRACT_FOLLOW_UP_TITLE, done: false } }),
    prisma.task.create({
      data: {
        title: CONTRACT_FOLLOW_UP_TITLE,
        assigneeId,
        createdById,
        dealId,
        dueDate: addDays(new Date(), 7),
      },
    }),
  ]);
}

/** Once the contract is actually signed, chasing the customer for a reply is
 * moot - auto-complete any still-open follow-up reminder instead of leaving
 * it sitting there as a stale task. */
export async function completeContractFollowUpTasks(dealId: string): Promise<void> {
  await prisma.task.updateMany({
    where: { dealId, title: CONTRACT_FOLLOW_UP_TITLE, done: false },
    data: { done: true },
  });
}
