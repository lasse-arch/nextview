import Link from "next/link";
import type { DealStage, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dealName } from "@/lib/labels";
import { LeadInboxList } from "./lead-inbox-list";

/** How many leads one page load shows - the rest are reached by searching
 * or filtering, which is how a list this size is actually worked. */
const PAGE_SIZE = 300;

type SearchParams = { q?: string; status?: string; list?: string; owner?: string };

const STATUS_FILTERS: Record<string, { label: string; stages: DealStage[] }> = {
  open: { label: "Åbne", stages: ["LEAD", "CONTACTED"] },
  LEAD: { label: "Ikke ringet", stages: ["LEAD"] },
  CONTACTED: { label: "Kontaktet", stages: ["CONTACTED"] },
  LOST: { label: "Tabt", stages: ["LOST"] },
};

/**
 * Leadindbakken - every lead that came in through a ringeliste and hasn't
 * been worked into a real deal yet (see Deal.inLeadInbox). Keeps the Deals
 * board to the deals actually being worked: a lead leaves here by itself
 * once a meeting is booked, or with "Flyt til Deals".
 */
export default async function LeadInboxPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const status = params.status && STATUS_FILTERS[params.status] ? params.status : "open";
  const q = params.q?.trim() ?? "";

  const where: Prisma.DealWhereInput = { inLeadInbox: true, stage: { in: STATUS_FILTERS[status].stages } };
  if (params.list) where.callListId = params.list;
  if (params.owner) where.ownerId = params.owner;
  if (q) {
    where.OR = [
      { companyName: { contains: q, mode: "insensitive" } },
      { displayName: { contains: q, mode: "insensitive" } },
      { contactName: { contains: q, mode: "insensitive" } },
      { contactPhone: { contains: q } },
      { address: { contains: q, mode: "insensitive" } },
      { cvrNumber: { contains: q } },
    ];
  }

  const [deals, total, stageCounts, callLists, users] = await Promise.all([
    prisma.deal.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: PAGE_SIZE,
      include: { owner: { select: { name: true } }, callList: { select: { name: true } } },
    }),
    prisma.deal.count({ where }),
    prisma.deal.groupBy({ by: ["stage"], where: { inLeadInbox: true }, _count: { _all: true } }),
    prisma.callList.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, name: true } }),
    prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const countFor = (key: string) =>
    STATUS_FILTERS[key].stages.reduce((sum, st) => sum + (stageCounts.find((c) => c.stage === st)?._count._all ?? 0), 0);

  function statusHref(key: string) {
    const sp = new URLSearchParams();
    if (key !== "open") sp.set("status", key);
    if (q) sp.set("q", q);
    if (params.list) sp.set("list", params.list);
    if (params.owner) sp.set("owner", params.owner);
    const qs = sp.toString();
    return `/leadindbakke${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Leadindbakke</h1>
        <p className="mt-1 text-sm text-slate-500">
          Alle leads fra ringelisterne, der ikke har fået et møde endnu. Når der bookes et møde, rykker leadet selv over
          på Deals - eller brug &quot;Flyt til Deals&quot; for et lead, du vil arbejde videre med.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {Object.entries(STATUS_FILTERS).map(([key, f]) => (
          <Link
            key={key}
            href={statusHref(key)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              status === key ? "bg-slate-900 text-white" : "border border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {f.label} ({countFor(key)})
          </Link>
        ))}
      </div>

      <form className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        {status !== "open" && <input type="hidden" name="status" value={status} />}
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Søg på navn, telefon, adresse, CVR…"
          className="min-w-0 flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
        />
        <select name="list" defaultValue={params.list ?? ""} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
          <option value="">Alle ringelister</option>
          {callLists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <select name="owner" defaultValue={params.owner ?? ""} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
          <option value="">Alle sælgere</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
          Filtrér
        </button>
      </form>

      <LeadInboxList
        total={total}
        leads={deals.map((d) => ({
          id: d.id,
          name: dealName(d),
          stage: d.stage,
          callListName: d.callList?.name ?? null,
          ownerName: d.owner?.name ?? null,
          contactPhone: d.contactPhone,
          contactEmail: d.contactEmail,
          address: d.address,
          updatedAt: d.updatedAt.toISOString(),
        }))}
      />
    </div>
  );
}
