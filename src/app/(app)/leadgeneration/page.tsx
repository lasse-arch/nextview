import { prisma } from "@/lib/db";
import { LeadFilterSection } from "./lead-filter-section";
import { UrlScanSection } from "./url-scan-section";
import { LeadCandidateSection } from "./lead-candidate-section";

export const maxDuration = 300;

export default async function LeadGenerationPage() {
  const [filters, watchedUrls, candidates, callLists] = await Promise.all([
    prisma.leadFilter.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { candidates: { where: { status: "NEW" } } } } },
    }),
    prisma.watchedUrl.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.leadCandidate.findMany({
      where: { status: "NEW" },
      orderBy: { createdAt: "desc" },
      // A single filter run can now surface up to MAX_LEAD_FILTER_RESULTS
      // (200) candidates on its own - keep the review list from silently
      // truncating below that just because several filters found leads the
      // same day.
      take: 500,
      include: { filter: { select: { name: true } } },
    }),
    // For the "Tilføj til ringeliste" quick-action - lets a candidate go
    // straight into whichever Ringeliste list is currently being worked
    // from, without leaving Leadgeneration first.
    prisma.callList.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, name: true } }),
  ]);

  const watchedUrlSet = new Set(watchedUrls.map((w) => w.url));
  const watchedLabels = new Map(
    watchedUrls.filter((w) => w.label).map((w) => [w.url, w.label as string])
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Leadgeneration</h1>
        <p className="mt-1 text-sm text-slate-500">
          Byg filtre på branche og område, eller scan en side for nævnte CVR-numre - begge dele søger i det
          officielle CVR-register og kan slås til, så de selv kører dagligt.
        </p>
      </div>

      <LeadFilterSection
        filters={filters.map((f) => ({
          id: f.id,
          name: f.name,
          industryQuery: f.industryQuery,
          municipality: f.municipality,
          activeOnly: f.activeOnly,
          foundedFrom: f.foundedFrom ? f.foundedFrom.toISOString() : null,
          foundedTo: f.foundedTo ? f.foundedTo.toISOString() : null,
          maxResults: f.maxResults,
          enabled: f.enabled,
          lastRunAt: f.lastRunAt ? f.lastRunAt.toISOString() : null,
          newCandidateCount: f._count.candidates,
          autoCreateDailyList: f.autoCreateDailyList,
          targetCallListId: f.targetCallListId,
        }))}
        callLists={callLists}
      />

      <UrlScanSection
        watchedUrls={watchedUrls.map((w) => ({
          id: w.id,
          url: w.url,
          label: w.label,
          enabled: w.enabled,
          lastScannedAt: w.lastScannedAt ? w.lastScannedAt.toISOString() : null,
          lastCvrCount: w.lastCvrCount,
          lastArticlesScanned: w.lastArticlesScanned,
          lastAddedCount: w.lastAddedCount,
          lastError: w.lastError,
        }))}
      />

      <LeadCandidateSection
        candidates={candidates.map((c) => {
          const watchedLabel = c.sourceUrl ? watchedLabels.get(c.sourceUrl) : undefined;
          return {
            id: c.id,
            companyName: c.companyName,
            cvrNumber: c.cvrNumber,
            address: c.address,
            industryText: c.industryText,
            industryCode: c.industryCode,
            website: c.website,
            foundedDate: c.foundedDate ? c.foundedDate.toISOString() : null,
            contactEmail: c.contactEmail,
            contactPhone: c.contactPhone,
            ownerName: c.ownerName,
            sourceLabel: c.filter?.name ?? watchedLabel ?? c.sourceUrl ?? null,
            // Groups by the filter/page itself rather than its display name, so
            // two filters that happen to share a name stay separate lists and
            // a list can be renamed (see CandidateGroup's "Omdøb").
            groupKey: c.filterId ? `filter:${c.filterId}` : c.sourceUrl ? `url:${c.sourceUrl}` : "none",
            renameTarget: c.filterId
              ? { kind: "filter" as const, id: c.filterId }
              : c.sourceUrl && watchedUrlSet.has(c.sourceUrl)
                ? { kind: "url" as const, url: c.sourceUrl }
                : null,
            createdAt: c.createdAt.toISOString(),
          };
        })}
        callLists={callLists}
      />
    </div>
  );
}
