import "server-only";
import type { Prisma } from "@prisma/client";
import { teamCan } from "@/lib/team-roles";

/**
 * Which of our tours a seller may send to new customers (as a showcase link -
 * the mail generator and the SMS): all of them, for sellers and admins. A tour
 * that isn't finished (not published, approved or live) opens its showcase
 * with "a tour we're still working on" (features.tsx, demoTour's `finished`).
 */
export function sendableTours(user: Parameters<typeof teamCan>[0]): Prisma.TourWhereInput {
  return teamCan(user, "admin") || teamCan(user, "sales") ? {} : { id: "__ingen__" };
}
