import "server-only";
import { prisma } from "@/lib/db";
import { deleteOldContestEntries } from "@/lib/tour-contest";

/*
 * What the data processing agreement (contract, Bilag 1 A) promises: personal
 * data from the tours' visitors is kept for 12 months at most. Run daily
 * (cron/contest-cleanup). Contest entries usually go much sooner - when the
 * draw's own time is up (lib/tour-contest.ts) - this is the hard limit for
 * everything, also a draw with a long keep time.
 */
export const KEEP_MONTHS = 12;

export async function deleteOldVisitorData(): Promise<{ contest: number; contestOld: number; messages: number }> {
  const before = new Date();
  before.setMonth(before.getMonth() - KEEP_MONTHS);
  const contest = await deleteOldContestEntries();
  const [contestOld, messages] = await Promise.all([
    prisma.tourContestEntry.deleteMany({ where: { createdAt: { lt: before } } }),
    // Messages from a tour's contact form (kept here before they only went by mail).
    prisma.tourMessage.deleteMany({ where: { createdAt: { lt: before } } }),
  ]);
  return { contest, contestOld: contestOld.count, messages: messages.count };
}
