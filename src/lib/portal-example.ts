import "server-only";
import { prisma } from "@/lib/db";
import { addDays, DK_REGIONS, type TourStats } from "@/lib/tour-stats";
import type { TourConfig } from "@/app/arpo/tour-lab/tours/types";

/*
 * "Eksempel på kundeportalen" (Generator → Kundeportal): the customer portal
 * as a new customer would have it, to show in a meeting - one of our showcase
 * tours (published and marked "Kan sendes som eksempel") with numbers made up
 * for it. Nothing of a real customer's is read: no stats, no contract, no
 * users, no draw entries, no feedback - only the tour itself, which is public.
 */

export const EXAMPLE_ID = "eksempel";

/** The showcase tours one can show the portal with. */
export async function exampleTours(): Promise<{ slug: string; name: string }[]> {
  const rows = await prisma.tour.findMany({ where: { showcase: true, published: true }, orderBy: { name: "asc" }, select: { slug: true, name: true, config: true } });
  return rows.map((t) => ({ slug: t.slug, name: (t.config as unknown as TourConfig)?.title || t.name }));
}

/** The tour the example shows: the one asked for, if it's a showcase tour - else the first. */
export async function exampleTour(slug: string | undefined) {
  const where = { showcase: true, published: true };
  const t = (slug && (await prisma.tour.findFirst({ where: { ...where, slug }, select: { slug: true, name: true, config: true, share: true, liveVersion: true } }))) || (await prisma.tour.findFirst({ where, orderBy: { name: "asc" }, select: { slug: true, name: true, config: true, share: true, liveVersion: true } }));
  return t;
}

/** The menu's rooms by name (each once) - what the example's "most seen" lists show. */
function menuRoomNames(T: TourConfig): string[] {
  const names = T.menu.flatMap((m) => ("items" in m ? m.items.map(([n]) => n) : [m.title]));
  return [...new Set(names)].filter((n) => n && !/^(book|kontakt|tilmeld)/i.test(n));
}

/** The made-up customer as the portal reads a deal: the showcase tour, published - nothing else (no contract, no invoices). */
export function exampleDeals(t: NonNullable<Awaited<ReturnType<typeof exampleTour>>>) {
  return [
    {
      id: EXAMPLE_ID,
      companyName: "Eksempel",
      displayName: (t.config as unknown as TourConfig)?.title || t.name,
      address: null,
      parentDealId: null,
      contractSignedAt: null,
      docusealSubmissionId: null,
      contractProducts: null,
      reportInterval: "OFF",
      nextReportDueAt: null,
      invoiceEmail: null,
      contactEmail: null,
      websiteUrl: null,
      items: [],
      tours: [{ slug: t.slug, name: t.name, config: t.config, share: t.share, reviewToken: null, liveVersion: t.liveVersion, published: true, reviewSentAt: null, reviewApprovedAt: null }],
    },
  ];
}

/** A steady "random" from a seed - so the example's numbers are the same every time it's shown. */
function seeded(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** Towns for the map, by region (lat/lng rounded like the real ones). */
const TOWNS: [string, string, number, number, number][] = [
  ["Aalborg", "81", 57.0, 9.9, 9],
  ["Hjørring", "81", 57.5, 10.0, 3],
  ["Aarhus", "82", 56.2, 10.2, 8],
  ["Viborg", "82", 56.5, 9.4, 3],
  ["Herning", "82", 56.1, 9.0, 2],
  ["Odense", "83", 55.4, 10.4, 4],
  ["Esbjerg", "83", 55.5, 8.5, 2],
  ["Vejle", "83", 55.7, 9.5, 2],
  ["København", "84", 55.7, 12.6, 6],
  ["Hillerød", "84", 55.9, 12.3, 1],
  ["Roskilde", "85", 55.6, 12.1, 2],
  ["Næstved", "85", 55.2, 11.8, 1],
];

/** Numbers for the period that look like a good tour's - made up, steady for the tour and the period. */
export function exampleStats(slug: string, T: TourConfig, from: string, to: string): TourStats {
  const rnd = seeded(`${slug}|${from}|${to}`);
  const days: string[] = [];
  for (let d = from; d <= to && days.length < 400; d = addDays(d, 1)) days.push(d);
  const perDay = days.map((day) => {
    const weekend = [0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay());
    const visits = Math.round((weekend ? 62 : 44) * (0.7 + rnd() * 0.6));
    return { day, visits, leads: Math.round(visits * (0.05 + rnd() * 0.05)) };
  });
  const visits = perDay.reduce((n, d) => n + d.visits, 0);
  const leads = perDay.reduce((n, d) => n + d.leads, 0);
  const share = (k: number) => Math.max(1, Math.round(visits * k));
  const ranked = (labels: string[], top: number) =>
    labels.slice(0, 8).map((label, i) => ({ label, count: share(top * Math.pow(0.78, i) * (0.85 + rnd() * 0.3)) }));
  const rooms = menuRoomNames(T);
  const located = Math.round(visits * 0.92);
  const weight = TOWNS.reduce((n, t) => n + t[4], 0);
  const abroad = Math.round(located * 0.06);
  const dk = located - abroad;
  const points = TOWNS.map(([city, , lat, lng, w]) => ({ lat, lng, city, count: Math.max(1, Math.round((dk * w) / weight)) }));
  const byRegion = (code: string) => points.filter((_, i) => TOWNS[i][1] === code).reduce((n, p) => n + p.count, 0);
  const guideStarted = share(0.31);
  return {
    days: days.length,
    from,
    to,
    countedFrom: null,
    visits,
    engaged: share(0.71),
    leads,
    medianSeconds: 140 + Math.round(rnd() * 70),
    mobileShare: 0.58 + rnd() * 0.08,
    perDay,
    actions: ranked(["Book en rundvisning", "phone", "email", "Tilmelding"], 0.035),
    places: ranked(rooms, 0.22),
    sources: [
      { label: "Forsiden af hjemmesiden", count: share(0.46) },
      { label: "google.com", count: share(0.21) },
      { label: "facebook.com", count: share(0.14) },
      { label: "direkte", count: share(0.12) },
      { label: "instagram.com", count: share(0.07) },
    ],
    live: { seen: 0, opened: 0, viewed: 0, booked: 0, units: [] },
    menu: { opened: share(0.64), groups: ranked(T.menu.filter((m) => "items" in m).map((m) => m.title), 0.3) },
    rooms: ranked(rooms, 0.38),
    geo: {
      located,
      regions: DK_REGIONS.map(([code, label]) => ({ code, label, count: byRegion(code) })),
      denmarkElse: 0,
      abroad: [
        { label: "Tyskland", count: Math.round(abroad * 0.6) },
        { label: "Sverige", count: Math.round(abroad * 0.25) },
        { label: "Norge", count: abroad - Math.round(abroad * 0.6) - Math.round(abroad * 0.25) },
      ].filter((a) => a.count > 0),
      points,
    },
    roomTime: rooms
      .slice(0, 6)
      .map((label, i) => ({ label, seconds: Math.round(48 - i * 5 + rnd() * 10), count: share(0.2 * Math.pow(0.8, i)) }))
      .sort((a, b) => b.seconds - a.seconds),
    opened: ranked(rooms.slice(2), 0.12),
    guide: { started: guideStarted, completed: Math.round(guideStarted * 0.64), leftAt: [], leftFor: [] },
  };
}
