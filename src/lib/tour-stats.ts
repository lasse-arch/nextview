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
export const ACTION = `(name IN ('cta_click', 'live_book', 'contact_form') OR (name = 'contact_click' AND label IN ('phone', 'email')))`;

/*
 * A tour on a customer's page (tour_embed) may start by itself, e.g. on the
 * front page - loaded isn't a visit. Such a visit counts once the tour was on
 * the screen (tour_seen) or used (tour_use), and it was engaged only when the
 * visitor actually did something in it (tour_use). A visit straight to the
 * tour (a link, a QR code) counts as before. Per session (in GROUP BY session).
 */
export const SHOWN = `(NOT bool_or(name = 'tour_embed') OR bool_or(name IN ('tour_seen', 'tour_use')))`;
const ENGAGED = `(bool_or(name = 'tour_use') OR (NOT bool_or(name = 'tour_embed') AND bool_or(name IN ('menu_click','place_click','room_view','guide_start','welcome_choice','route_start','info_open','place_card_view'))))`;

export type TourStats = {
  days: number;
  /** The chosen period ("YYYY-MM-DD", both included) - null for "the last `days` days". */
  from: string | null;
  to: string | null;
  /** When the numbers were started (first published or reset) - null: all along. */
  countedFrom?: string | null;
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
  /** The menu: visits that opened it, and how many opened each of its groups (does anyone look inside them?). */
  menu: { opened: number; groups: { label: string; count: number }[] };
  /** Where visitors went around inside: the rooms they came to (however they got there). */
  rooms: { label: string; count: number }[];
  /** Where they stayed longest: the typical (median) seconds in each room, and in how many visits. */
  roomTime: { label: string; seconds: number; count: number }[];
  /** What they opened along the way: points on the aerial photo, info points, place cards, 360° photos. */
  opened: { label: string; count: number }[];
  /** "Vis mig rundt": visits that started it and saw it to the end, at which stop those who left it did, and what they went to. */
  /** "Vis mig rundt" - where they left it is for the main one; `byGuide` = each guided tour (its "#rundvisning…" link) when there are more. */
  guide: {
    started: number;
    completed: number;
    leftAt: { stop: number; count: number }[];
    leftFor: { label: string; count: number }[];
    byGuide?: { guide: string; started: number; completed: number }[];
    /** Each stop of the main one, by its title: how many saw it, how long they stayed (median seconds) and how often its voice was played. */
    stops?: { title: string; seen: number; medianSeconds: number; voice: number }[];
  };
};

/**
 * The first time a tour goes out, its numbers start from that moment - the
 * team's own looks while it was made aren't the customer's visitors. Only the
 * first time (a tour published again keeps its numbers).
 */
export async function startStatsIfFirst(slug: string): Promise<void> {
  await prisma.tour.updateMany({ where: { slug, statsSince: null }, data: { statsSince: new Date() } }).catch(() => {});
}

/** A chosen period, as days "YYYY-MM-DD" (both included). */
export type StatsRange = { from: string; to: string };

const YMD = /^\d{4}-\d{2}-\d{2}$/;
export const isYmd = (s: unknown): s is string => typeof s === "string" && YMD.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`));

/** Today in Denmark, "YYYY-MM-DD". */
export const todayDK = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Copenhagen" }).format(new Date());

/** A day plus n days, as "YYYY-MM-DD". */
export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Midnight at the start of a day in Danish time (summer or winter). */
function dayStart(ymd: string): Date {
  const noon = new Date(`${ymd}T12:00:00Z`);
  const off = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Copenhagen", timeZoneName: "shortOffset" }).formatToParts(noon).find((p) => p.type === "timeZoneName")?.value ?? "GMT+1";
  const hours = Number(/GMT([+-]\d+)/.exec(off)?.[1] ?? 1);
  return new Date(Date.parse(`${ymd}T00:00:00Z`) - hours * 3_600_000);
}

export async function tourStats(slug: string, range: number | StatsRange = 30): Promise<TourStats> {
  // The last N days up to now, or a chosen period: from the start of its first day to the end of its last (Danish time).
  const span = typeof range === "number" ? null : range;
  const last = typeof range === "number" ? range : 0;
  const asked = span ? dayStart(span.from) : new Date(Date.now() - last * 86_400_000);
  // Nothing from before the numbers were started (first published, or reset by hand).
  const counted = (await prisma.tour.findUnique({ where: { slug }, select: { statsSince: true } }))?.statsSince ?? null;
  const since = counted && counted > asked ? counted : asked;
  const until = span ? dayStart(addDays(span.to, 1)) : new Date(Date.now() + 60_000);
  const days = span ? Math.round((Date.parse(`${addDays(span.to, 1)}T12:00:00Z`) - Date.parse(`${span.from}T12:00:00Z`)) / 86_400_000) : last;
  const [sessions, perDay, actions, places, sources, liveFunnel, liveUnits, menuOpened, menuGroups, rooms, roomTime, opened] = await Promise.all([
    prisma.$queryRawUnsafe<{ visits: bigint; engaged: bigint; leads: bigint; median: number | null; mobile: bigint }[]>(
      `WITH s AS (
         SELECT session,
                ${SHOWN} AS shown,
                ${ENGAGED} AS engaged,
                bool_or(${ACTION}) AS lead,
                LEAST(EXTRACT(EPOCH FROM max("createdAt") - min("createdAt")), 1800) AS secs, -- a tab left open isn't a 3-hour visit
                bool_or(device = 'mobil') AS mobile
         FROM "TourEvent" WHERE "tourSlug" = $1 AND "createdAt" >= $2 AND "createdAt" < $3 GROUP BY session)
       SELECT count(*) AS visits, count(*) FILTER (WHERE engaged) AS engaged, count(*) FILTER (WHERE lead) AS leads,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY secs) AS median, count(*) FILTER (WHERE mobile) AS mobile FROM s WHERE shown`,
      slug,
      since,
      until
    ),
    prisma.$queryRawUnsafe<{ day: Date; visits: bigint; leads: bigint }[]>(
      `WITH s AS (SELECT session FROM "TourEvent" WHERE "tourSlug" = $1 AND "createdAt" >= $2 AND "createdAt" < $3 GROUP BY session HAVING ${SHOWN})
       SELECT date_trunc('day', e."createdAt" AT TIME ZONE 'Europe/Copenhagen') AS day,
              count(DISTINCT e.session) AS visits, count(DISTINCT e.session) FILTER (WHERE ${ACTION}) AS leads
       FROM "TourEvent" e JOIN s ON s.session = e.session WHERE e."tourSlug" = $1 AND e."createdAt" >= $2 AND e."createdAt" < $3 GROUP BY 1 ORDER BY 1`,
      slug,
      since,
      until
    ),
    top(slug, since, until, `${ACTION}`),
    top(slug, since, until, `name IN ('menu_click','place_click')`),
    top(slug, since, until, `name = 'tour_open'`),
    prisma.$queryRawUnsafe<{ seen: bigint; opened: bigint; viewed: bigint; booked: bigint }[]>(
      `SELECT count(DISTINCT session) FILTER (WHERE name = 'live_seen') AS seen, count(DISTINCT session) FILTER (WHERE name = 'live_open') AS opened,
              count(DISTINCT session) FILTER (WHERE name = 'live_view') AS viewed, count(DISTINCT session) FILTER (WHERE name = 'live_book') AS booked
       FROM "TourEvent" WHERE "tourSlug" = $1 AND "createdAt" >= $2 AND "createdAt" < $3 AND name LIKE 'live_%'`,
      slug,
      since,
      until
    ),
    top(slug, since, until, `name = 'live_book'`),
    prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(DISTINCT session) AS n FROM "TourEvent" WHERE "tourSlug" = $1 AND "createdAt" >= $2 AND "createdAt" < $3 AND name = 'menu_open'`, slug, since, until),
    top(slug, since, until, `name = 'menu_group_open'`),
    top(slug, since, until, `name = 'room_view' AND label IS NOT NULL AND label <> '(uden navn)'`),
    prisma.$queryRawUnsafe<{ label: string; seconds: number; count: bigint }[]>(
      `SELECT label, percentile_cont(0.5) WITHIN GROUP (ORDER BY value) AS seconds, count(DISTINCT session) AS count FROM "TourEvent"
       WHERE "tourSlug" = $1 AND "createdAt" >= $2 AND "createdAt" < $3 AND name = 'room_time' AND value IS NOT NULL AND value >= 2 AND label IS NOT NULL
       GROUP BY label HAVING count(DISTINCT session) >= 3 ORDER BY seconds DESC LIMIT 8`,
      slug,
      since,
      until
    ),
    top(slug, since, until, `name IN ('drone_point_click','info_open','place_card_view','pano_open') AND label IS NOT NULL`),
  ]);
  const [guideRuns, guideLeftAt, guideLeftFor, byGuide, guideStopRows] = await Promise.all([
    prisma.$queryRawUnsafe<{ started: bigint; completed: bigint }[]>(
      `SELECT count(DISTINCT session) FILTER (WHERE name = 'guide_start') AS started, count(DISTINCT session) FILTER (WHERE name = 'guide_complete') AS completed
       FROM "TourEvent" WHERE "tourSlug" = $1 AND "createdAt" >= $2 AND "createdAt" < $3 AND name IN ('guide_start', 'guide_complete')`,
      slug,
      since,
      until
    ),
    prisma.$queryRawUnsafe<{ stop: number; count: bigint }[]>(
      `SELECT value AS stop, count(DISTINCT session) AS count FROM "TourEvent"
       WHERE "tourSlug" = $1 AND "createdAt" >= $2 AND "createdAt" < $3 AND name = 'guide_leave' AND value IS NOT NULL AND (url IS NULL OR url = '#rundvisning') GROUP BY value ORDER BY value LIMIT 40`,
      slug,
      since,
      until
    ),
    top(slug, since, until, `name = 'guide_leave' AND (url IS NULL OR url = '#rundvisning')`),
    // Each guided tour by its link (events from before there were more have none: the main one).
    prisma.$queryRawUnsafe<{ guide: string; started: bigint; completed: bigint }[]>(
      `SELECT COALESCE(url, '#rundvisning') AS guide, count(DISTINCT session) FILTER (WHERE name = 'guide_start') AS started, count(DISTINCT session) FILTER (WHERE name = 'guide_complete') AS completed
       FROM "TourEvent" WHERE "tourSlug" = $1 AND "createdAt" >= $2 AND "createdAt" < $3 AND name IN ('guide_start', 'guide_complete') GROUP BY 1 ORDER BY 2 DESC LIMIT 20`,
      slug,
      since,
      until
    ),
    // Per stop of the main one: the time at it (guide_stop_time, seconds) and its voice played (guide_audio).
    prisma.$queryRawUnsafe<{ title: string; seen: bigint; median: number | null; voice: bigint }[]>(
      `SELECT label AS title,
              count(DISTINCT session) FILTER (WHERE name = 'guide_stop_time') AS seen,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY value) FILTER (WHERE name = 'guide_stop_time') AS median,
              count(*) FILTER (WHERE name = 'guide_audio') AS voice
       FROM "TourEvent" WHERE "tourSlug" = $1 AND "createdAt" >= $2 AND "createdAt" < $3 AND name IN ('guide_stop_time', 'guide_audio') AND label IS NOT NULL AND (url IS NULL OR url = '#rundvisning')
       GROUP BY label LIMIT 60`,
      slug,
      since,
      until
    ),
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
    countedFrom: counted?.toISOString() ?? null,
    from: span?.from ?? null,
    to: span?.to ?? null,
    perDay: Array.from({ length: days }, (_, i) => {
      const day = span ? addDays(span.from, i) : new Date(Date.now() - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10);
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
    menu: { opened: Number(menuOpened[0]?.n ?? 0), groups: menuGroups },
    rooms,
    roomTime: roomTime.map((r) => ({ label: r.label, seconds: Math.round(r.seconds), count: Number(r.count) })),
    opened,
    guide: {
      started: Number(guideRuns[0]?.started ?? 0),
      completed: Number(guideRuns[0]?.completed ?? 0),
      leftAt: guideLeftAt.map((r) => ({ stop: Number(r.stop), count: Number(r.count) })),
      leftFor: guideLeftFor,
      byGuide: byGuide.length > 1 ? byGuide.map((r) => ({ guide: r.guide, started: Number(r.started), completed: Number(r.completed) })) : undefined,
      stops: guideStopRows.length ? guideStopRows.map((r) => ({ title: r.title, seen: Number(r.seen), medianSeconds: Math.round(Number(r.median ?? 0)), voice: Number(r.voice) })) : undefined,
    },
  };
}

async function top(slug: string, since: Date, until: Date, where: string) {
  const rows = await prisma.$queryRawUnsafe<{ label: string | null; count: bigint }[]>(
    `SELECT label, count(DISTINCT session) AS count FROM "TourEvent"
     WHERE "tourSlug" = $1 AND "createdAt" >= $2 AND "createdAt" < $3 AND ${where} GROUP BY label ORDER BY count DESC LIMIT 8`,
    slug,
    since,
    until
  );
  return rows.map((r) => ({ label: r.label ?? "(uden navn)", count: Number(r.count) }));
}

/** Leads per tour in the last `days` days (for the overview). */
export async function leadsByTour(days = 30): Promise<Record<string, { visits: number; leads: number }>> {
  const rows = await prisma.$queryRawUnsafe<{ tourSlug: string; visits: bigint; leads: bigint }[]>(
    `WITH s AS (SELECT "tourSlug", session, bool_or(${ACTION}) AS lead FROM "TourEvent" WHERE "createdAt" >= $1 GROUP BY "tourSlug", session HAVING ${SHOWN})
     SELECT "tourSlug", count(*) AS visits, count(*) FILTER (WHERE lead) AS leads FROM s GROUP BY "tourSlug"`,
    new Date(Date.now() - days * 86_400_000)
  );
  return Object.fromEntries(rows.map((r) => [r.tourSlug, { visits: Number(r.visits), leads: Number(r.leads) }]));
}
