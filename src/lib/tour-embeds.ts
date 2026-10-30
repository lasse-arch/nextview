import "server-only";
import { prisma } from "@/lib/db";

/*
 * "Her er touren vist": the pages that show a tour in a frame (a customer's
 * website), from the tour's own measurement ("tour_embed" - the page's
 * address without anything after ? or #). Arpo's own previews don't count.
 */

export type TourEmbed = { host: string; url: string | null; visits: number; lastSeen: string; /** Whole days since it was last opened there (0 = today). */ daysAgo: number };

/** The pages showing these tours in the last 90 days, the newest first. */
export async function tourEmbeds(slugs: string[]): Promise<TourEmbed[]> {
  if (!slugs.length) return [];
  const rows = await prisma.$queryRawUnsafe<{ host: string | null; url: string | null; visits: bigint; last: Date }[]>(
    `SELECT label AS host, url, count(DISTINCT session) AS visits, max("createdAt") AS last FROM "TourEvent"
     WHERE "tourSlug" = ANY($1::text[]) AND name = 'tour_embed' AND "createdAt" >= now() - interval '90 days'
     GROUP BY label, url ORDER BY last DESC LIMIT 30`,
    slugs
  );
  return rows.map((r) => ({ host: r.host ?? "ukendt side", url: r.url && /^https?:\/\//.test(r.url) ? r.url : null, visits: Number(r.visits), lastSeen: r.last.toISOString(), daysAgo: Math.max(0, Math.floor((Date.now() - r.last.getTime()) / 86_400_000)) }));
}
