import { prisma } from "@/lib/db";
import { searchCvr } from "@/lib/cvr-search";
import { scanUrlForCvrLeads } from "@/lib/url-lead-scan";

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

/**
 * Re-scans one watched page for CVR-number mentions - skips the (slower,
 * per-CVR-lookup) processing entirely when the page's text hasn't changed
 * since the last scan (`lastContentHash`), which is the common case for a
 * daily re-check of most pages.
 */
export async function runWatchedUrl(
  watchedUrlId: string
): Promise<{ ok: true; added: number; unchanged: boolean } | { ok: false; error: string }> {
  const watched = await prisma.watchedUrl.findUniqueOrThrow({ where: { id: watchedUrlId } });

  const scan = await scanUrlForCvrLeads(watched.url);
  if (!scan.ok) return scan;

  if (scan.contentHash === watched.lastContentHash) {
    await prisma.watchedUrl.update({ where: { id: watchedUrlId }, data: { lastScannedAt: new Date() } });
    return { ok: true, added: 0, unchanged: true };
  }

  const cvrNumbers = scan.hits.map((h) => h.cvr);
  const [existingCandidates, existingDeals] = await Promise.all([
    prisma.leadCandidate.findMany({ where: { cvrNumber: { in: cvrNumbers } }, select: { cvrNumber: true } }),
    prisma.deal.findMany({ where: { cvrNumber: { in: cvrNumbers } }, select: { cvrNumber: true } }),
  ]);
  const known = new Set([
    ...existingCandidates.map((c) => c.cvrNumber),
    ...existingDeals.map((d) => d.cvrNumber).filter((c): c is string => Boolean(c)),
  ]);
  const fresh = scan.hits.filter((h) => !known.has(h.cvr));

  if (fresh.length > 0) {
    await prisma.leadCandidate.createMany({
      data: fresh.map((h) => ({
        sourceUrl: watched.url,
        cvrNumber: h.cvr,
        companyName: h.name,
        address: h.address,
        contactEmail: h.contactEmail,
        contactPhone: h.contactPhone,
      })),
      skipDuplicates: true,
    });
  }

  await prisma.watchedUrl.update({
    where: { id: watchedUrlId },
    data: { lastScannedAt: new Date(), lastContentHash: scan.contentHash },
  });

  return { ok: true, added: fresh.length, unchanged: false };
}

/** Daily cron entry point for watched pages - same one-at-a-time, paced pattern as the filters. */
export async function runAllEnabledWatchedUrls(): Promise<{ checked: number; added: number; failed: number }> {
  const urls = await prisma.watchedUrl.findMany({ where: { enabled: true }, select: { id: true } });

  let added = 0;
  let failed = 0;
  for (let i = 0; i < urls.length; i++) {
    const result = await runWatchedUrl(urls[i].id);
    if (result.ok) added += result.added;
    else failed++;
    if (i < urls.length - 1) await sleep(2000);
  }

  return { checked: urls.length, added, failed };
}
