import "server-only";
import { prisma } from "@/lib/db";
import { buildDealEmailAddress } from "@/lib/email-address";

// Kept out of the "use server" actions file so it is not a public server action -
// callers (the deal actions) check the user first.
/**
 * Duplicates a deal as a fresh lead - copies the company/contact info so it
 * doesn't need retyping, but resets stage, sale info, contract/integration
 * fields and notes so the copy starts its own pipeline from scratch.
 */
export async function createDuplicateDealRecord(dealId: string) {
  const source = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });

  const companyName = `${source.companyName} (kopi)`;
  const displayName = source.displayName ? `${source.displayName} (kopi)` : null;

  const deal = await prisma.deal.create({
    data: {
      companyName,
      displayName,
      cvrNumber: source.cvrNumber,
      address: source.address,
      latitude: source.latitude,
      longitude: source.longitude,
      contactName: source.contactName,
      contactEmail: source.contactEmail,
      contactPhone: source.contactPhone,
      invoiceEmail: source.invoiceEmail,
      ownerId: source.ownerId,
      importType: "MANUAL",
    },
  });

  await prisma.deal.update({
    where: { id: deal.id },
    data: { dealEmailAddress: buildDealEmailAddress(deal.id) },
  });

  return deal;
}

