import "server-only";
import { prisma } from "@/lib/db";
import type { StagingItem, TourConfig } from "@/app/arpo/tour-lab/tours/types";

/*
 * "Skattejagt": a treasure chest in a tour (a staging item of kind
 * "treasure") opens a draw - the entries are kept here for the customer (the
 * school is the data controller), seen on their page by those who may see
 * personal data, and deleted by themselves `keepDays` (default 30) after the
 * winner is drawn - or that long after the closing day when nobody drew one.
 */

/** Today in Denmark, YYYY-MM-DD. */
export const todayDK = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });

/** The chests of a setup with a draw. */
export const contestChests = (T: TourConfig | null | undefined): (StagingItem & { contest: NonNullable<StagingItem["contest"]> })[] =>
  (T?.staging ?? []).filter((i): i is StagingItem & { contest: NonNullable<StagingItem["contest"]> } => i.kind === "treasure" && Boolean(i.contest?.ends));

/** Is the draw still open (up to and including its closing day)? */
export const contestOpen = (c: { ends: string }) => /^\d{4}-\d{2}-\d{2}$/.test(c.ends) && todayDK() <= c.ends;

/** Deletes the lists whose time is up (run daily, and when a list is looked at). Returns how many entries went. */
export async function deleteOldContestEntries(): Promise<number> {
  const groups = await prisma.tourContestEntry.groupBy({ by: ["tourSlug", "itemId"], _max: { winnerAt: true } });
  if (!groups.length) return 0;
  const tours = await prisma.tour.findMany({ where: { slug: { in: [...new Set(groups.map((g) => g.tourSlug))] } }, select: { slug: true, config: true } });
  const conf = new Map(tours.map((t) => [t.slug, t.config as unknown as TourConfig]));
  let gone = 0;
  for (const g of groups) {
    const chest = contestChests(conf.get(g.tourSlug)).find((c) => c.id === g.itemId);
    const keep = (chest?.contest.keepDays ?? 30) * 86_400_000;
    // From the draw - or, without one, from the closing day (a chest that's gone from the tour: from the last entry).
    const from = g._max.winnerAt?.getTime() ?? (chest ? Date.parse(`${chest.contest.ends}T23:59:59+01:00`) : null);
    const last = from ?? (await prisma.tourContestEntry.findFirst({ where: { tourSlug: g.tourSlug, itemId: g.itemId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }))?.createdAt.getTime();
    if (last != null && Date.now() - last > keep) {
      const r = await prisma.tourContestEntry.deleteMany({ where: { tourSlug: g.tourSlug, itemId: g.itemId } });
      gone += r.count;
    }
  }
  return gone;
}
