import "server-only";
import { prisma } from "@/lib/db";

/*
 * "Her er touren vist": the pages that show a tour in a frame (a customer's
 * website), from the tour's own measurement ("tour_embed" - the page's
 * address without anything after ? or #). Arpo's own previews don't count.
 */

/** One page showing the tour: visits where the tour was on the screen there (`seen`) and where it was used (`used`) - not just loaded with the page. */
export type TourEmbed = { host: string; url: string | null; seen: number; used: number; lastSeen: string; /** Whole days since it was last loaded there (0 = today). */ daysAgo: number };

/** The pages showing these tours in the last 90 days, the newest first. */
/**
 * Where a web developer tries the page, not where visitors come: their own
 * computer (localhost, an IP address, .local) and the builders' preview
 * addresses (Lovable's id-preview--… and …lovableproject.com, Vercel's
 * preview deployments, StackBlitz, CodeSandbox, ngrok …). Left out of "Her er
 * touren vist" - the customer's own site (also a published lovable.app) stays.
 */
export function isDevHost(host: string | null): boolean {
  const h = (host ?? "").toLowerCase().replace(/:\d+$/, "");
  if (!h) return false;
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.startsWith("[")) return true;
  if (/^id-preview-[a-z0-9-]*--/.test(h) || h.endsWith(".lovableproject.com")) return true;
  if (/-git-[a-z0-9-]+\.vercel\.app$/.test(h) || /\.(webcontainer\.io|stackblitz\.io|csb\.app|codesandbox\.io|ngrok-free\.app|ngrok\.io|ngrok\.app|trycloudflare\.com)$/.test(h)) return true;
  return false;
}

export async function tourEmbeds(slugs: string[]): Promise<TourEmbed[]> {
  if (!slugs.length) return [];
  // Each visit's page, then whether the tour was seen (half of it on the screen for a second) or used there.
  const rows = await prisma.$queryRawUnsafe<{ host: string | null; url: string | null; seen: bigint; used: bigint; last: Date }[]>(
    `WITH e AS (
       SELECT DISTINCT ON (session) session, label AS host, url, "createdAt" FROM "TourEvent"
       WHERE "tourSlug" = ANY($1::text[]) AND name = 'tour_embed' AND "createdAt" >= now() - interval '90 days'
       ORDER BY session, "createdAt" DESC),
     u AS (
       SELECT session, bool_or(name IN ('tour_seen', 'tour_use')) AS seen, bool_or(name = 'tour_use') AS used FROM "TourEvent"
       WHERE "tourSlug" = ANY($1::text[]) AND "createdAt" >= now() - interval '90 days' AND session IN (SELECT session FROM e) GROUP BY session)
     SELECT e.host, e.url, count(*) FILTER (WHERE u.seen) AS seen, count(*) FILTER (WHERE u.used) AS used, max(e."createdAt") AS last
     FROM e LEFT JOIN u USING (session) GROUP BY e.host, e.url ORDER BY last DESC LIMIT 30`,
    slugs
  );
  return rows.filter((r) => !isDevHost(r.host)).map((r) => ({
    host: r.host ?? "ukendt side",
    url: r.url && /^https?:\/\//.test(r.url) ? r.url : null,
    seen: Number(r.seen),
    used: Number(r.used),
    lastSeen: r.last.toISOString(),
    daysAgo: Math.max(0, Math.floor((Date.now() - r.last.getTime()) / 86_400_000)),
  }));
}
