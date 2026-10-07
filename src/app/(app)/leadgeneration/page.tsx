import { prisma } from "@/lib/db";
import { LeadFilterSection } from "./lead-filter-section";
import { UrlScanSection } from "./url-scan-section";
import { LeadCandidateSection, type KnownLeadStatus } from "./lead-candidate-section";
import { MAX_LEAD_FILTER_RESULTS } from "@/lib/cvr-search";

export const maxDuration = 300;

/**
 * Each list under "Fundne leads", loaded per list rather than as one global
 * newest-N slice - a single big list (a broad filter's 400+ finds) used to
 * fill that whole slice on its own and push every other list off the page.
 * Each list gets up to one full run's worth of its own newest entries, plus
 * its true total so the heading count stays right beyond that cap. Lists come
 * back newest-first by their most recent find.
 *
 * A filter's list is its unreviewed LeadFilterMatch rows - which can include
 * a company another filter found first or that is already a deal (see
 * LeadFilterMatch). A scanned page's list (no filter) and an imported CSV's
 * list are just their NEW candidates.
 */
async function loadFoundLeadLists() {
  const [filterGroups, pageGroups, importGroups] = await Promise.all([
    prisma.leadFilterMatch.groupBy({
      by: ["filterId"],
      where: { handledAt: null },
      _count: { _all: true },
      _max: { createdAt: true },
    }),
    prisma.leadCandidate.groupBy({
      by: ["sourceUrl"],
      where: { status: "NEW", filterId: null, importListId: null },
      _count: { _all: true },
      _max: { createdAt: true },
    }),
    prisma.leadCandidate.groupBy({
      by: ["importListId"],
      where: { status: "NEW", filterId: null, importListId: { not: null } },
      _count: { _all: true },
      _max: { createdAt: true },
    }),
  ]);

  const lists = [
    ...filterGroups.map((g) => ({ newest: g._max.createdAt, load: async () => {
      const matches = await prisma.leadFilterMatch.findMany({
        where: { filterId: g.filterId, handledAt: null },
        orderBy: { createdAt: "desc" },
        take: MAX_LEAD_FILTER_RESULTS,
        include: { candidate: true, filter: { select: { name: true } } },
      });
      return matches.map((m) => ({
        candidate: m.candidate,
        listFilterId: m.filterId,
        listFilterName: m.filter.name,
        importList: null,
        sourceUrl: null,
        listedAt: m.createdAt,
        groupTotal: g._count._all,
      }));
    } })),
    ...pageGroups.map((g) => ({ newest: g._max.createdAt, load: async () => {
      const candidates = await prisma.leadCandidate.findMany({
        where: { status: "NEW", filterId: null, importListId: null, sourceUrl: g.sourceUrl },
        orderBy: { createdAt: "desc" },
        take: MAX_LEAD_FILTER_RESULTS,
      });
      return candidates.map((c) => ({
        candidate: c,
        listFilterId: null,
        listFilterName: null,
        importList: null,
        sourceUrl: g.sourceUrl,
        listedAt: c.createdAt,
        groupTotal: g._count._all,
      }));
    } })),
    ...importGroups.map((g) => ({ newest: g._max.createdAt, load: async () => {
      const candidates = await prisma.leadCandidate.findMany({
        where: { status: "NEW", filterId: null, importListId: g.importListId },
        // Kept in the file's own order (createMany inserts in row order).
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: MAX_LEAD_FILTER_RESULTS,
        include: { importList: { select: { id: true, name: true } } },
      });
      return candidates.map(({ importList, ...c }) => ({
        candidate: c,
        listFilterId: null,
        listFilterName: null,
        importList,
        sourceUrl: null,
        listedAt: c.createdAt,
        groupTotal: g._count._all,
      }));
    } })),
  ];
  lists.sort((a, b) => (b.newest?.getTime() ?? 0) - (a.newest?.getTime() ?? 0));
  const rows = (await Promise.all(lists.map((l) => l.load()))).flat();

  // For the "allerede tilføjet" note on a lead that's already a deal -
  // matched by CVR number as well as the candidate's own dealId, since a
  // deal can exist for the company without ever having come from here.
  const deals = await prisma.deal.findMany({
    where: {
      OR: [
        { id: { in: rows.map((r) => r.candidate.dealId).filter((id): id is string => Boolean(id)) } },
        { cvrNumber: { in: rows.map((r) => r.candidate.cvrNumber).filter((c): c is string => Boolean(c)) } },
      ],
    },
    select: { id: true, cvrNumber: true, stage: true, callList: { select: { name: true } } },
  });
  const dealById = new Map(deals.map((d) => [d.id, d]));
  const dealByCvr = new Map(deals.filter((d) => d.cvrNumber).map((d) => [d.cvrNumber as string, d]));

  return rows.map((r) => {
    const deal =
      (r.candidate.dealId && dealById.get(r.candidate.dealId)) ||
      (r.candidate.cvrNumber ? dealByCvr.get(r.candidate.cvrNumber) : undefined);
    const known: KnownLeadStatus | null = deal
      ? { kind: "deal", dealId: deal.id, stage: deal.stage, callListName: deal.callList?.name ?? null }
      : r.candidate.status === "DISMISSED"
        ? { kind: "dismissed" }
        : null;
    return { ...r, known };
  });
}

export default async function LeadGenerationPage() {
  const [filters, watchedUrls, candidates, callLists] = await Promise.all([
    prisma.leadFilter.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { matches: { where: { handledAt: null, candidate: { status: "NEW", dealId: null } } } } },
      },
    }),
    prisma.watchedUrl.findMany({ orderBy: { createdAt: "desc" } }),
    loadFoundLeadLists(),
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
          foundedWithinDays: f.foundedWithinDays,
          maxResults: f.maxResults,
          enabled: f.enabled,
          lastRunAt: f.lastRunAt ? f.lastRunAt.toISOString() : null,
          newCandidateCount: f._count.matches,
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
        candidates={candidates.map(({ candidate: c, listFilterId, listFilterName, importList, sourceUrl, listedAt, groupTotal, known }) => {
          const watchedLabel = sourceUrl ? watchedLabels.get(sourceUrl) : undefined;
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
            sourceLabel: listFilterName ?? importList?.name ?? watchedLabel ?? sourceUrl ?? null,
            groupTotal,
            listFilterId,
            known,
            // Groups by the filter/page itself rather than its display name, so
            // two filters that happen to share a name stay separate lists and
            // a list can be renamed (see CandidateGroup's "Omdøb").
            groupKey: listFilterId
              ? `filter:${listFilterId}`
              : importList
                ? `import:${importList.id}`
                : sourceUrl
                  ? `url:${sourceUrl}`
                  : "none",
            renameTarget: listFilterId
              ? { kind: "filter" as const, id: listFilterId }
              : importList
                ? { kind: "import" as const, id: importList.id }
                : sourceUrl && watchedUrlSet.has(sourceUrl)
                ? { kind: "url" as const, url: sourceUrl }
                : null,
            createdAt: listedAt.toISOString(),
          };
        })}
        callLists={callLists}
      />
    </div>
  );
}
