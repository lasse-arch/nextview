import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";

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
  return new NextResponse(null, { status: 204 });
}
