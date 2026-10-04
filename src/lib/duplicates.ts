import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export async function findDuplicateDeals(companyName: string, excludeDealId?: string) {
  const name = companyName.trim();
  if (!name) return [];

  return prisma.deal.findMany({
    where: {
      companyName: { equals: name, mode: "insensitive" },
      ...(excludeDealId ? { id: { not: excludeDealId } } : {}),
    },
    select: { id: true, companyName: true, stage: true },
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

export type PossibleDuplicate = {
  id: string;
  name: string;
  stage: string;
  inLeadInbox: boolean;
  callListName: string | null;
  /** Why it matched, e.g. ["samme CVR", "samme adresse"]. */
  reasons: string[];
};

function normalizeName(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** "Vestergade 25A, 9850 Hirtshals" -> { street: "vestergade 25a", postalCode: "9850" } */
function addressKey(address: string | null | undefined): { street: string; postalCode: string | null } | null {
  if (!address) return null;
  const street = address.split(",")[0].trim().toLowerCase().replace(/[.]/g, "").replace(/\s+/g, " ");
  if (!/\d/.test(street) || street.length < 4) return null;
  const postalCode = /\b(\d{4})\b/.exec(address.split(",").slice(1).join(","))?.[1] ?? null;
  return { street, postalCode };
}

/**
 * Deals that may be the same company as the given one - same CVR number,
 * same name or kaldenavn (either way round), or the same street address
 * (and postcode, when both have one). Covers deals anywhere, including leads
 * marked Tabt in Leadindbakken, so re-adding a company someone already
 * called and gave up on is flagged rather than silently starting over.
 */
export async function findPossibleDuplicates(deal: {
  id?: string;
  companyName: string;
  displayName?: string | null;
  cvrNumber?: string | null;
  address?: string | null;
}): Promise<PossibleDuplicate[]> {
  const names = [normalizeName(deal.companyName), normalizeName(deal.displayName)].filter(Boolean);
  const addr = addressKey(deal.address);
  const or: Prisma.DealWhereInput[] = [];
  if (deal.cvrNumber) or.push({ cvrNumber: deal.cvrNumber });
  for (const name of names) {
    or.push({ companyName: { equals: name, mode: "insensitive" } }, { displayName: { equals: name, mode: "insensitive" } });
  }
  if (addr) or.push({ address: { startsWith: addr.street.split(" ")[0], mode: "insensitive" } });
  if (or.length === 0) return [];

  const candidates = await prisma.deal.findMany({
    where: { OR: or, ...(deal.id ? { id: { not: deal.id } } : {}) },
    select: {
      id: true,
      companyName: true,
      displayName: true,
      cvrNumber: true,
      address: true,
      stage: true,
      inLeadInbox: true,
      callList: { select: { name: true } },
    },
    take: 50,
  });

  const results: PossibleDuplicate[] = [];
  for (const c of candidates) {
    const reasons: string[] = [];
    if (deal.cvrNumber && c.cvrNumber === deal.cvrNumber) reasons.push("samme CVR");
    const theirNames = [normalizeName(c.companyName), normalizeName(c.displayName)].filter(Boolean);
    if (names.some((n) => theirNames.includes(n))) reasons.push("samme navn");
    const theirAddr = addressKey(c.address);
    if (
      addr &&
      theirAddr &&
      theirAddr.street === addr.street &&
      (!addr.postalCode || !theirAddr.postalCode || addr.postalCode === theirAddr.postalCode)
    ) {
      reasons.push("samme adresse");
    }
    if (reasons.length > 0) {
      results.push({
        id: c.id,
        name: c.displayName || c.companyName,
        stage: c.stage,
        inLeadInbox: c.inLeadInbox,
        callListName: c.callList?.name ?? null,
        reasons,
      });
    }
  }
  return results;
}
