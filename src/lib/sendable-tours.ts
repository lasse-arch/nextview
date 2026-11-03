import "server-only";
import type { Prisma } from "@prisma/client";
import { teamCan } from "@/lib/team-roles";

/**
 * Which of our tours a seller may send to new customers (as a showcase link -
 * the mail generator and the SMS): an admin any; the others the ones chosen
 * as examples (Kan sendes som eksempel), the ones out on the net, and the ones
 * sent to their customer for review (i gennemgang).
 */
export function sendableTours(user: Parameters<typeof teamCan>[0]): Prisma.TourWhereInput {
  return teamCan(user, "admin") ? {} : { OR: [{ showcase: true }, { published: true }, { liveVersion: { not: null } }, { reviewSentAt: { not: null } }] };
}
