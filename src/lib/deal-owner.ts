import "server-only";
import { prisma } from "@/lib/db";

/** A lead taken over on the ringeliste: a note on the deal, so the one who put it on the list can see where it went. */
export async function noteNewOwner(dealId: string, oldOwnerId: string, user: { id: string; name: string }, why: string) {
  const old = await prisma.user.findUnique({ where: { id: oldOwnerId }, select: { name: true } });
  await prisma.note
    .create({ data: { dealId, authorId: user.id, kind: "MANUAL", body: `${user.name} er nu ejer af leadet (${why})${old?.name ? ` - før ${old.name}` : ""}.` } })
    .catch(() => {});
}
