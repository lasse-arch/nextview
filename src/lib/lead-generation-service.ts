import { prisma } from "@/lib/db";
import { searchCvr } from "@/lib/cvr-search";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs one saved filter: searches the CVR register, then inserts a
 * LeadCandidate for every hit not already known - `cvrNumber` is globally
 * unique (see schema), so a company already surfaced by this or any other
 * filter (whether still NEW, already ADDED, or DISMISSED) is silently
 * skipped rather than shown again. Also skips any CVR number that's already
 * an existing Deal, so a current lead/customer never gets re-suggested.
 */
export async function runLeadFilter(filterId: string): Promise<{ ok: true; added: number } | { ok: false; error: string }> {
  const filter = await prisma.leadFilter.findUniqueOrThrow({ where: { id: filterId } });

  const result = await searchCvr({
    industryQuery: filter.industryQuery,
    municipality: filter.municipality,
    activeOnly: filter.activeOnly,
  });
  if (!result.ok) return result;

  const cvrNumbers = result.hits.map((h) => h.cvr);
  const [existingCandidates, existingDeals] = await Promise.all([
    prisma.leadCandidate.findMany({ where: { cvrNumber: { in: cvrNumbers } }, select: { cvrNumber: true } }),
    prisma.deal.findMany({ where: { cvrNumber: { in: cvrNumbers } }, select: { cvrNumber: true } }),
  ]);
  const known = new Set([
    ...existingCandidates.map((c) => c.cvrNumber),
    ...existingDeals.map((d) => d.cvrNumber).filter((c): c is string => Boolean(c)),
  ]);

  const fresh = result.hits.filter((h) => !known.has(h.cvr));

  if (fresh.length > 0) {
    await prisma.leadCandidate.createMany({
      data: fresh.map((h) => ({
        filterId: filter.id,
        cvrNumber: h.cvr,
        companyName: h.name,
        address: h.address,
        industryText: h.industryText,
        foundedDate: h.foundedDate ? new Date(h.foundedDate) : null,
        contactEmail: h.contactEmail,
        contactPhone: h.contactPhone,
      })),
      skipDuplicates: true,
    });
  }

  await prisma.leadFilter.update({ where: { id: filterId }, data: { lastRunAt: new Date() } });

  return { ok: true, added: fresh.length };
}

/**
 * Daily cron entry point: runs every enabled filter, one at a time with a
 * short pause in between - distribution.virk.dk is a shared, free
 * government service (also used by the plain CVR-lookup elsewhere in the
 * app), so filters are deliberately not run in parallel or back-to-back.
 */
export async function runAllEnabledLeadFilters(): Promise<{ checked: number; added: number; failed: number }> {
  const filters = await prisma.leadFilter.findMany({ where: { enabled: true }, select: { id: true } });

  let added = 0;
  let failed = 0;
  for (let i = 0; i < filters.length; i++) {
    const result = await runLeadFilter(filters[i].id);
    if (result.ok) added += result.added;
    else failed++;
    if (i < filters.length - 1) await sleep(3000);
  }

  return { checked: filters.length, added, failed };
}
