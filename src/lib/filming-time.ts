import "server-only";
import { prisma } from "@/lib/db";

/*
 * A deal's filming time (incl. setting up and transport): the hours registered
 * as "Filming" in the time registration - two people filming are both counted.
 * Only when none are registered is the hand-typed "Filmtid" on the deal used.
 * A deal can't go Live without one of them.
 */

/** Minutes registered as "Filming" per deal (only the deals that have some). */
export async function registeredFilming(dealIds: string[]): Promise<Map<string, number>> {
  if (!dealIds.length) return new Map();
  const rows = await prisma.timeEntry.groupBy({ by: ["dealId"], where: { dealId: { in: dealIds }, category: "FILMING" }, _sum: { minutes: true } });
  return new Map(rows.filter((r) => (r._sum.minutes ?? 0) > 0).map((r) => [r.dealId, r._sum.minutes!]));
}

/** The deal's filming time in minutes - registered "Filming" first, else the hand-typed one - and where it comes from. */
export async function filmingTime(deal: { id: string; filmingActualMinutes: number | null }): Promise<{ minutes: number | null; registered: boolean }> {
  const registered = (await registeredFilming([deal.id])).get(deal.id);
  if (registered) return { minutes: registered, registered: true };
  return { minutes: deal.filmingActualMinutes, registered: false };
}
