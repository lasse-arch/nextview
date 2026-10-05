import { prisma } from "@/lib/db";
import { RingelisteClient } from "./ringeliste-client";

const OPEN_STAGES = ["LEAD", "CONTACTED", "FOLLOW_UP"] as const;

export default async function RingelistePage({
  searchParams,
}: {
  searchParams: Promise<{ list?: string }>;
}) {
  const { list: listParam } = await searchParams;

  const lists = await prisma.callList.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { deals: { where: { stage: { in: [...OPEN_STAGES] } } } } } },
    take: 30,
  });

  const selectedListId = listParam && lists.some((l) => l.id === listParam) ? listParam : lists[0]?.id ?? null;

  const deals = selectedListId
    ? await prisma.deal.findMany({
        where: { callListId: selectedListId, stage: { in: [...OPEN_STAGES] } },
        // Not-yet-tried leads first (in the order they were added), then those
        // that went to voicemail - longest ago first, so "Telefonsvar" sends a
        // lead to the back of the queue.
        orderBy: [{ lastVoicemailAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
        select: {
          id: true,
          companyName: true,
          displayName: true,
          cvrNumber: true,
          address: true,
          contactName: true,
          contactPhone: true,
          contactEmail: true,
          websiteUrl: true,
          stage: true,
          lastVoicemailAt: true,
        },
      })
    : [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Ringeliste</h1>
        <p className="mt-1 text-sm text-slate-500">
          Indsæt links (CVR-opslag, Facebook-sider, hjemmesider, ...) én pr. linje - de bliver til rigtige leads du
          kan ringe igennem, opdelt i dagens liste i stedet for en WhatsApp-tråd.
        </p>
      </div>

      <RingelisteClient
        lists={lists.map((l) => ({ id: l.id, name: l.name, openCount: l._count.deals }))}
        selectedListId={selectedListId}
        deals={deals}
      />
    </div>
  );
}
