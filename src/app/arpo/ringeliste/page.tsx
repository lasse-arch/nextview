import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { RingelisteClient } from "./ringeliste-client";
import { placeOf } from "@/lib/lead-place";

// Only leads not yet worked: once a deal moves on (Kontaktet, Opfølgning,
// Møde booket, ...) from here or anywhere else, it drops off the list.
const OPEN_STAGES = ["LEAD"] as const;

// Adding a directory link (e.g. all 176 DK-CAMP campsites) fetches each
// business's page - room for that inside the "Tilføj til liste" request.
export const maxDuration = 300;

export default async function RingelistePage({
  searchParams,
}: {
  searchParams: Promise<{ list?: string }>;
}) {
  const { list: listParam } = await searchParams;
  const currentUser = await requireUser();
  // "Kort" (one card per lead) or "Sheet" (a spreadsheet) - as it was left on this computer.
  const view = (await cookies()).get("ringeliste-vis")?.value === "sheet" ? "sheet" : "kort";

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
          lastVoicemailBy: true,
          voicemailCount: true,
          ownerId: true,
          // The latest note from a call, shown on the card.
          notes: { where: { body: { startsWith: "Opkald: " } }, orderBy: { createdAt: "desc" }, take: 1, select: { body: true, createdAt: true, author: { select: { name: true } } } },
        },
      })
    : [];
  // For "Inviter også" when booking a meeting straight from the list.
  const users = await prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });

  return (
    <div className={`mx-auto space-y-6 ${view === "sheet" ? "max-w-[1600px]" : "max-w-3xl"}`}>
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold text-slate-900">Ringeliste</h1>
        <p className="mt-1 text-sm text-slate-500">
          Indsæt links (CVR-opslag, Facebook-sider, hjemmesider, ...) én pr. linje - de bliver til rigtige leads du
          kan ringe igennem, opdelt i dagens liste i stedet for en WhatsApp-tråd.
        </p>
      </div>

      <RingelisteClient
        lists={lists.map((l) => ({ id: l.id, name: l.name, openCount: l._count.deals }))}
        selectedListId={selectedListId}
        // Each lead with where it is (distance from the office, region, kommune) - from the postcode in its address.
        deals={deals.map(({ notes, ...d }) => ({
          ...d,
          place: placeOf(d.address),
          lastCallNote: notes[0] ? { body: notes[0].body.replace(/^Opkald: /, ""), at: notes[0].createdAt.toISOString(), by: notes[0].author.name } : null,
        }))}
        users={users}
        currentUserId={currentUser.id}
        isAdmin={currentUser.role === "ADMIN"}
        view={view}
      />
    </div>
  );
}
