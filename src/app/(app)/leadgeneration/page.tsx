import { prisma } from "@/lib/db";
import { LeadFilterSection } from "./lead-filter-section";
import { LeadCandidateSection } from "./lead-candidate-section";

export const maxDuration = 300;

export default async function LeadGenerationPage() {
  const [filters, candidates] = await Promise.all([
    prisma.leadFilter.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { candidates: { where: { status: "NEW" } } } } },
    }),
    prisma.leadCandidate.findMany({
      where: { status: "NEW" },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { filter: { select: { name: true } } },
    }),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Leadgeneration</h1>
        <p className="mt-1 text-sm text-slate-500">
          Byg filtre på branche og område - de søger i det officielle CVR-register og kan køres når som helst,
          eller slås til så de selv kører dagligt og finder nye virksomheder, der matcher.
        </p>
      </div>

      <LeadFilterSection
        filters={filters.map((f) => ({
          id: f.id,
          name: f.name,
          industryQuery: f.industryQuery,
          municipality: f.municipality,
          activeOnly: f.activeOnly,
          enabled: f.enabled,
          lastRunAt: f.lastRunAt ? f.lastRunAt.toISOString() : null,
          newCandidateCount: f._count.candidates,
        }))}
      />

      <LeadCandidateSection
        candidates={candidates.map((c) => ({
          id: c.id,
          companyName: c.companyName,
          cvrNumber: c.cvrNumber,
          address: c.address,
          industryText: c.industryText,
          foundedDate: c.foundedDate ? c.foundedDate.toISOString() : null,
          contactEmail: c.contactEmail,
          contactPhone: c.contactPhone,
          filterName: c.filter?.name ?? null,
          createdAt: c.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
