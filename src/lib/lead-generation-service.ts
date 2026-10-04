import { prisma } from "@/lib/db";
import { searchCvr, MAX_LEAD_FILTER_RESULTS, MAX_CVR_SEARCH_WINDOW, type CvrSearchHit } from "@/lib/cvr-search";
import { scanUrlForCvrLeads } from "@/lib/url-lead-scan";
import { lookupCvrNumber } from "@/lib/cvr";
import { claimCandidateAndUpsertDeal } from "@/lib/actions/lead-generation";
import { findOrCreateTodayCallList } from "@/lib/actions/call-lists";
import { logActivity } from "@/lib/activity";
import { dealName } from "@/lib/labels";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Runs `fn` over `items` with at most `concurrency` in flight at once. */
async function mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

/**
 * Runs one saved filter: searches the CVR register, then inserts a
 * LeadCandidate for every hit not already known - `cvrNumber` is globally
 * unique (see schema), so a company already surfaced by this or any other
 * filter (whether still NEW, already ADDED, or DISMISSED) is silently
 * skipped rather than shown again. Also skips any CVR number that's already
 * an existing Deal, so a current lead/customer never gets re-suggested.
 */
export type RunLeadFilterResult =
  | {
      ok: true;
      added: number;
      matched: number | null;
      alreadyKnown: number;
      /** Already-known companies newly added to this filter's own list
       * (shown there with a note that they were already added elsewhere). */
      alreadyKnownShown: number;
    }
  | { ok: false; error: string };

export async function runLeadFilter(filterId: string): Promise<RunLeadFilterResult> {
  const filter = await prisma.leadFilter.findUniqueOrThrow({ where: { id: filterId } });
  const search = {
    industryQuery: filter.industryQuery,
    municipality: filter.municipality,
    activeOnly: filter.activeOnly,
    foundedFrom: filter.foundedFrom ? filter.foundedFrom.toISOString().slice(0, 10) : null,
    foundedTo: filter.foundedTo ? filter.foundedTo.toISOString().slice(0, 10) : null,
  };

  // "Op til N pr. kørsel" means N leads that are *new* to the CRM, not the
  // first N matches - a broad filter matching more than N companies would
  // otherwise get the same newest-N page back every run, all already known,
  // and never reach the older matches behind it. Pages through the register
  // (newest-founded first) skipping known CVR numbers until N fresh ones are
  // collected or the matches run out.
  const fresh: CvrSearchHit[] = [];
  // Matches the CRM already knows - another filter's candidate, or an
  // existing deal (dealId set when there's no candidate row for it yet).
  const knownHits: { hit: CvrSearchHit; dealIdWithoutCandidate: string | null }[] = [];
  const seen = new Set<string>();
  let alreadyKnown = 0;
  let matched: number | null = null;
  for (let from = 0; from < MAX_CVR_SEARCH_WINDOW && fresh.length < filter.maxResults; from += MAX_LEAD_FILTER_RESULTS) {
    const page = await searchCvr(search, MAX_LEAD_FILTER_RESULTS, from);
    if (!page.ok) {
      if (from === 0) return page;
      break; // keep what earlier pages found rather than losing the whole run
    }
    matched ??= page.total;

    const pageHits = page.hits.filter((h) => !seen.has(h.cvr));
    pageHits.forEach((h) => seen.add(h.cvr));
    const cvrNumbers = pageHits.map((h) => h.cvr);
    const [existingCandidates, existingDeals] = await Promise.all([
      prisma.leadCandidate.findMany({ where: { cvrNumber: { in: cvrNumbers } }, select: { cvrNumber: true } }),
      prisma.deal.findMany({ where: { cvrNumber: { in: cvrNumbers } }, select: { id: true, cvrNumber: true } }),
    ]);
    const candidateCvrs = new Set(existingCandidates.map((c) => c.cvrNumber));
    const dealIdByCvr = new Map(existingDeals.map((d) => [d.cvrNumber, d.id]));
    for (const h of pageHits) {
      if (candidateCvrs.has(h.cvr) || dealIdByCvr.has(h.cvr)) {
        alreadyKnown++;
        knownHits.push({ hit: h, dealIdWithoutCandidate: candidateCvrs.has(h.cvr) ? null : dealIdByCvr.get(h.cvr)! });
      } else if (fresh.length < filter.maxResults) {
        fresh.push(h);
      }
    }

    if (page.hits.length < MAX_LEAD_FILTER_RESULTS) break; // last page
  }

  // The ES search doesn't expose an owner name the way the single-CVR lookup
  // does - only worth the extra round-trip for genuinely new finds, not the
  // whole search-result page. Now that a filter can pull up to
  // MAX_LEAD_FILTER_RESULTS fresh hits in one run (not just "usually a
  // handful"), these run a few at a time instead of one-by-one so a big
  // first run doesn't eat into the route's own time budget.
  const ownerLookups = await mapWithConcurrency(fresh, 5, async (h) => {
    const lookup = await lookupCvrNumber(h.cvr);
    return { cvr: h.cvr, ownerName: lookup.ok ? lookup.data.contactName : null };
  });
  const ownerNames = new Map(ownerLookups.map((l) => [l.cvr, l.ownerName]));

  if (fresh.length > 0) {
    await prisma.leadCandidate.createMany({
      data: fresh.map((h) => ({
        filterId: filter.id,
        cvrNumber: h.cvr,
        companyName: h.name,
        address: h.address,
        industryText: h.industryText,
        industryCode: h.industryCode,
        website: h.website,
        foundedDate: h.foundedDate ? new Date(h.foundedDate) : null,
        contactEmail: h.contactEmail,
        contactPhone: h.contactPhone,
        ownerName: ownerNames.get(h.cvr) ?? null,
      })),
      skipDuplicates: true,
    });

    // A filter configured to auto-feed a Ringeliste skips the "Fundne
    // leads" review step entirely - every fresh match is promoted straight
    // to a Deal on the chosen list, same as a manual "Tilføj til
    // ringeliste" click would do.
    if (filter.autoCreateDailyList || filter.targetCallListId) {
      const callListId = filter.autoCreateDailyList
        ? (await findOrCreateTodayCallList(filter.createdById)).id
        : filter.targetCallListId!;
      const list = await prisma.callList.findUniqueOrThrow({ where: { id: callListId } });
      const freshCandidates = await prisma.leadCandidate.findMany({
        where: { cvrNumber: { in: fresh.map((h) => h.cvr) }, filterId: filter.id },
        select: { id: true },
      });
      for (const candidate of freshCandidates) {
        const result = await claimCandidateAndUpsertDeal(candidate.id, filter.createdById, { callListId }).catch(
          () => null
        );
        if (result && "created" in result && result.created) {
          const deal = await prisma.deal.findUniqueOrThrow({ where: { id: result.dealId } });
          await logActivity({
            type: "DEAL_CREATED",
            message: `Filteret "${filter.name}" tilføjede automatisk ${dealName(deal)} til ${list.name}`,
            actorId: filter.createdById,
            dealId: deal.id,
          });
        }
      }
    }
  }

  // Every company this run turned up goes on this filter's own list, not
  // just the fresh ones - one already found by another filter, or already a
  // deal, still shows there (with a note saying so) instead of vanishing
  // into "fandtes allerede". An existing deal with no candidate row yet gets
  // one (already ADDED, linked to that deal) so it has something to list.
  const dealOnly = knownHits.filter((k) => k.dealIdWithoutCandidate);
  if (dealOnly.length > 0) {
    await prisma.leadCandidate.createMany({
      data: dealOnly.map(({ hit: h, dealIdWithoutCandidate }) => ({
        filterId: filter.id,
        cvrNumber: h.cvr,
        companyName: h.name,
        address: h.address,
        industryText: h.industryText,
        industryCode: h.industryCode,
        website: h.website,
        foundedDate: h.foundedDate ? new Date(h.foundedDate) : null,
        contactEmail: h.contactEmail,
        contactPhone: h.contactPhone,
        status: "ADDED" as const,
        dealId: dealIdWithoutCandidate,
      })),
      skipDuplicates: true,
    });
  }

  // An auto-feeding filter skips "Fundne leads" altogether, so its matches
  // are recorded as already handled - kept only so a later run doesn't
  // treat them as unseen.
  const handledAt = filter.autoCreateDailyList || filter.targetCallListId ? new Date() : null;
  const candidateIdsFor = async (cvrs: string[]) =>
    cvrs.length === 0
      ? []
      : (await prisma.leadCandidate.findMany({ where: { cvrNumber: { in: cvrs } }, select: { id: true } })).map((c) => c.id);
  const [freshIds, knownIds] = await Promise.all([
    candidateIdsFor(fresh.map((h) => h.cvr)),
    candidateIdsFor(knownHits.map((k) => k.hit.cvr)),
  ]);
  await prisma.leadFilterMatch.createMany({
    data: freshIds.map((candidateId) => ({ filterId: filter.id, candidateId, handledAt })),
    skipDuplicates: true,
  });
  // skipDuplicates leaves a match this list already has (or had and was
  // reviewed) untouched, so the count is only the newly listed ones.
  const knownShown = await prisma.leadFilterMatch.createMany({
    data: knownIds.map((candidateId) => ({ filterId: filter.id, candidateId, handledAt })),
    skipDuplicates: true,
  });

  await prisma.leadFilter.update({ where: { id: filterId }, data: { lastRunAt: new Date() } });

  return { ok: true, added: fresh.length, matched, alreadyKnown, alreadyKnownShown: handledAt ? 0 : knownShown.count };
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
  if (!scan.ok) {
    await prisma.watchedUrl.update({ where: { id: watchedUrlId }, data: { lastScannedAt: new Date(), lastError: scan.error } });
    return scan;
  }

  if (scan.contentHash === watched.lastContentHash) {
    await prisma.watchedUrl.update({
      where: { id: watchedUrlId },
      data: {
        lastScannedAt: new Date(),
        lastCvrCount: scan.cvrNumbers.length,
        lastArticlesScanned: scan.articlesScanned,
        lastAddedCount: 0,
        lastError: null,
      },
    });
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
        industryText: h.industryText,
        industryCode: h.industryCode,
        website: h.website,
        contactEmail: h.contactEmail,
        contactPhone: h.contactPhone,
        ownerName: h.ownerName,
      })),
      skipDuplicates: true,
    });
  }

  await prisma.watchedUrl.update({
    where: { id: watchedUrlId },
    data: {
      lastScannedAt: new Date(),
      lastContentHash: scan.contentHash,
      lastCvrCount: scan.cvrNumbers.length,
      lastArticlesScanned: scan.articlesScanned,
      lastAddedCount: fresh.length,
      lastError: null,
    },
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
