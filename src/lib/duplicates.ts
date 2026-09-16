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
