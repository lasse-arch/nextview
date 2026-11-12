import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ipOf, isTeamNetwork } from "@/lib/team-network";

/*
 * Arpo's own measurement of the tours: the engine (experience.tsx) sends what
 * happens in a visit here in small batches. Public - the tours will be shown
 * to anyone - so only known tours, a handful of short fields and a capped
 * batch are accepted.
 */

const known = { at: 0, slugs: new Set<string>() };
async function tourExists(slug: string) {
  if (Date.now() - known.at > 60_000) {
    known.slugs = new Set((await prisma.tour.findMany({ select: { slug: true } })).map((t) => t.slug));
    known.at = Date.now();
  }
  return known.slugs.has(slug);
}

/** A geo header from the network (Vercel's, or Cloudflare's when it's in front) - short, decoded. */
function geo(request: NextRequest, ...names: string[]): string | null {
  for (const name of names) {
    const v = request.headers.get(name);
    if (!v) continue;
    try {
      return decodeURIComponent(v).slice(0, 80);
    } catch {
      return v.slice(0, 80);
    }
  }
  return null;
}
/** A coordinate rounded to 0.1° (about 10 km) - the town, never the address. */
const coarse = (v: string | null, max: number) => {
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) && Math.abs(n) <= max ? Math.round(n * 10) / 10 : null;
};
/** Visits whose place is already kept (this instance) - so each visit is written once. */
const placed = new Set<string>();

const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (raw.length > 20_000) return new NextResponse(null, { status: 413 });
  let body: { tour?: unknown; session?: unknown; device?: unknown; events?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const tour = text(body.tour, 80);
  const session = text(body.session, 40);
  if (!tour || !session || !Array.isArray(body.events) || !(await tourExists(tour))) return new NextResponse(null, { status: 400 });
  // From one of the team's own networks: our own look, not a guest - not counted (visits, the map).
  if (await isTeamNetwork(ipOf(request.headers))) return new NextResponse(null, { status: 204 });
  const device = body.device === "mobil" ? "mobil" : "computer";
  const events = body.events
    .slice(0, 50)
    .map((e: { name?: unknown; label?: unknown; url?: unknown; value?: unknown }) => ({
      name: text(e?.name, 40),
      label: text(e?.label, 120),
      url: text(e?.url, 500),
      // A whole number of at most an hour (seconds in a room) - anything else is dropped.
      value: typeof e?.value === "number" && Number.isInteger(e.value) && e.value >= 0 && e.value <= 3600 ? e.value : null,
    }))
    .filter((e): e is { name: string; label: string | null; url: string | null; value: number | null } => Boolean(e.name && /^[a-z_]+$/.test(e.name)));
  if (events.length) await prisma.tourEvent.createMany({ data: events.map((e) => ({ ...e, tourSlug: tour, session, device })) });
  // Where the visit came from, roughly: the town from the network (about 10 km), once per visit - for the map in the statistics. No IP is kept.
  const visit = `${tour}|${session}`;
  if (events.length && !placed.has(visit)) {
    if (placed.size > 50_000) placed.clear();
    placed.add(visit);
    const place = {
      country: geo(request, "x-vercel-ip-country", "cf-ipcountry")?.slice(0, 2).toUpperCase() ?? null,
      region: geo(request, "x-vercel-ip-country-region", "cf-region-code")?.slice(0, 8) ?? null,
      city: geo(request, "x-vercel-ip-city", "cf-ipcity"),
      lat: coarse(geo(request, "x-vercel-ip-latitude", "cf-iplatitude"), 90),
      lng: coarse(geo(request, "x-vercel-ip-longitude", "cf-iplongitude"), 180),
    };
    if (place.country || place.lat != null) await prisma.tourVisitPlace.createMany({ data: [{ tourSlug: tour, session, ...place }], skipDuplicates: true }).catch(() => {});
  }
  return new NextResponse(null, { status: 204 });
}
