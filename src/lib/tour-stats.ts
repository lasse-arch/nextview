import "server-only";
import { prisma } from "@/lib/db";

/*
 * What a tour brings its customer, from Arpo's own measurement (TourEvent):
 * visits, how many go on to act (book, order, call, write) and what they
 * look at on the way. "Leads" are visits with at least one such action -
 * a click on the way to booking, not a confirmed booking (the booking system
 * would have to tell us that).
 */

/** Events that mean the visitor acted: a link out of the tour (booking, order …) or a call/mail. */
export const ACTION = `(name IN ('cta_click', 'live_book') OR (name = 'contact_click' AND label IN ('phone', 'email')))`;

export type TourStats = {
  days: number;
  visits: number;
  engaged: number;
  leads: number;
  medianSeconds: number;
  mobileShare: number;
  perDay: { day: string; visits: number; leads: number }[];
  actions: { label: string; count: number }[];
  places: { label: string; count: number }[];
  sources: { label: string; count: number }[];
  /** Live data (free units): visits that saw them, opened the list, looked at one, and booked one - plus the units booked most. */
  live: { seen: number; opened: number; viewed: number; booked: number; units: { label: string; count: number }[] };
};

export async function tourStats(slug: string, days = 30): Promise<TourStats> {
  const since = new Date(Date.now() - days * 86_400_000);
  const [sessions, perDay, actions, places, sources, liveFunnel, liveUnits] = await Promise.all([
    prisma.$queryRawUnsafe<{ visits: bigint; engaged: bigint; leads: bigint; median: number | null; mobile: bigint }[]>(
      `WITH s AS (
         SELECT session,
                bool_or(name IN ('menu_click','place_click','room_view','guide_start','welcome_choice','route_start','info_open','place_card_view')) AS engaged,
                bool_or(${ACTION}) AS lead,
                LEAST(EXTRACT(EPOCH FROM max("createdAt") - min("createdAt")), 1800) AS secs, -- a tab left open isn't a 3-hour visit
                bool_or(device = 'mobil') AS mobile
         FROM "TourEvent" WHERE "tourSlug" = $1 AND "createdAt" >= $2 GROUP BY session)
       SELECT count(*) AS visits, count(*) FILTER (WHERE engaged) AS engaged, count(*) FILTER (WHERE lead) AS leads,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY secs) AS median, count(*) FILTER (WHERE mobile) AS mobile FROM s`,
      slug,
      since
    ),
    prisma.$queryRawUnsafe<{ day: Date; visits: bigint; leads: bigint }[]>(
      `SELECT date_trunc('day', "createdAt" AT TIME ZONE 'Europe/Copenhagen') AS day,
              count(DISTINCT session) AS visits, count(DISTINCT session) FILTER (WHERE ${ACTION}) AS leads
       FROM "TourEvent" WHERE "tourSlug" = $1 AND "createdAt" >= $2 GROUP BY 1 ORDER BY 1`,
      slug,
      since
    ),
    top(slug, since, `${ACTION}`),
    top(slug, since, `name IN ('menu_click','place_click')`),
    top(slug, since, `name = 'tour_open'`),
    prisma.$queryRawUnsafe<{ seen: bigint; opened: bigint; viewed: bigint; booked: bigint }[]>(
      `SELECT count(DISTINCT session) FILTER (WHERE name = 'live_seen') AS seen, count(DISTINCT session) FILTER (WHERE name = 'live_open') AS opened,
              count(DISTINCT session) FILTER (WHERE name = 'live_view') AS viewed, count(DISTINCT session) FILTER (WHERE name = 'live_book') AS booked
       FROM "TourEvent" WHERE "tourSlug" = $1 AND "createdAt" >= $2 AND name LIKE 'live_%'`,
      slug,
      since
    ),
    top(slug, since, `name = 'live_book'`),
  ]);
  const s = sessions[0];
  const visits = Number(s?.visits ?? 0);
  const byDay = new Map(perDay.map((d) => [d.day.toISOString().slice(0, 10), d]));
  return {
    days,
    visits,
    engaged: Number(s?.engaged ?? 0),
    leads: Number(s?.leads ?? 0),
    medianSeconds: Math.round(s?.median ?? 0),
    mobileShare: visits ? Number(s.mobile) / visits : 0,
    perDay: Array.from({ length: days }, (_, i) => {
      const day = new Date(Date.now() - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10);
      const d = byDay.get(day);
      return { day, visits: Number(d?.visits ?? 0), leads: Number(d?.leads ?? 0) };
    }),
    actions,
    places,
    sources,
    live: {
      seen: Number(liveFunnel[0]?.seen ?? 0),
      opened: Number(liveFunnel[0]?.opened ?? 0),
      viewed: Number(liveFunnel[0]?.viewed ?? 0),
      booked: Number(liveFunnel[0]?.booked ?? 0),
      units: liveUnits,
    },
  };
}

async function top(slug: string, since: Date, where: string) {
  const rows = await prisma.$queryRawUnsafe<{ label: string | null; count: bigint }[]>(
    `SELECT label, count(DISTINCT session) AS count FROM "TourEvent"
     WHERE "tourSlug" = $1 AND "createdAt" >= $2 AND ${where} GROUP BY label ORDER BY count DESC LIMIT 8`,
    slug,
    since
  );
  return rows.map((r) => ({ label: r.label ?? "(uden navn)", count: Number(r.count) }));
}

/** Leads per tour in the last `days` days (for the overview). */
export async function leadsByTour(days = 30): Promise<Record<string, { visits: number; leads: number }>> {
  const rows = await prisma.$queryRawUnsafe<{ tourSlug: string; visits: bigint; leads: bigint }[]>(
    `SELECT "tourSlug", count(DISTINCT session) AS visits, count(DISTINCT session) FILTER (WHERE ${ACTION}) AS leads
     FROM "TourEvent" WHERE "createdAt" >= $1 GROUP BY "tourSlug"`,
    new Date(Date.now() - days * 86_400_000)
  );
  return Object.fromEntries(rows.map((r) => [r.tourSlug, { visits: Number(r.visits), leads: Number(r.leads) }]));
}
