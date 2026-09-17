import { prisma } from "@/lib/db";

export async function findDuplicateDeals(companyName: string, excludeDealId?: string) {
  const name = companyName.trim();
  if (!name) return [];

  return prisma.deal.findMany({
    where: {
      companyName: { equals: name, mode: "insensitive" },
      ...(excludeDealId ? { id: { not: excludeDealId } } : {}),
    },
    select: { id: true, companyName: true },
  });
}

const duplicateReviewSelect = {
  id: true,
  companyName: true,
  displayName: true,
  stage: true,
  saleAmount: true,
  createdAt: true,
  owner: { select: { name: true } },
} as const;

/**
 * Pairs up deals from a just-finished import batch with pre-existing deals
 * of the same company name, so the importer can decide which copy to keep.
 */
export async function findDuplicatePairsForBatch(batchId: string) {
  const importedDeals = await prisma.deal.findMany({
    where: { importBatchId: batchId },
    select: duplicateReviewSelect,
  });

  const pairs: { newDeal: (typeof importedDeals)[number]; existingDeal: (typeof importedDeals)[number] }[] = [];

  for (const newDeal of importedDeals) {
    const existingDeal = await prisma.deal.findFirst({
      where: {
        companyName: { equals: newDeal.companyName, mode: "insensitive" },
        id: { not: newDeal.id },
        OR: [{ importBatchId: null }, { importBatchId: { not: batchId } }],
      },
      select: duplicateReviewSelect,
    });
    if (existingDeal) pairs.push({ newDeal, existingDeal });
  }

  return pairs;
}
