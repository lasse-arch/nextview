import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { tourCors } from "@/lib/tour-cors";
import { weatherMonths, weatherNow } from "@/lib/weather";
import type { TourConfig } from "@/app/arpo/tour-lab/tours/types";

/*
 * The weather for a tour's drone scene (lib/weather.ts). Public and
 * read-only, for published tours - and for the team's own preview of one
 * not yet published. Only the place stored on the tour is ever looked up;
 * answers are cached (here and at the edge), and each address gets a
 * limited number of asks a minute.
 */

const asks = new Map<string, { at: number; n: number }>();
function tooMany(request: Request): boolean {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "ukendt";
  const now = Date.now();
  const a = asks.get(ip);
  if (!a || now - a.at > 60_000) {
    if (asks.size > 5000) asks.clear();
    asks.set(ip, { at: now, n: 1 });
    return false;
  }
  return ++a.n > 30;
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (tooMany(request)) return new NextResponse(null, { status: 429, headers: tourCors(request, { "Retry-After": "60" }) });
  const tour = await prisma.tour.findUnique({ where: { slug: (await params).slug }, select: { config: true, published: true } });
  const team = tour && !tour.published ? Boolean(await getCurrentUser()) : false;
  const w = tour && (tour.published || team) ? (tour.config as unknown as TourConfig).weather : undefined;
  if (!w || !Number.isFinite(w.lat) || !Number.isFinite(w.lon)) return NextResponse.json({ now: null, months: null }, { status: 404, headers: tourCors(request) });
  const [now, months] = await Promise.all([weatherNow(w.lat, w.lon), weatherMonths(w.lat, w.lon)]);
  return NextResponse.json(
    { place: w.place, now, months },
    { headers: tourCors(request, { "Cache-Control": team ? "private, no-store" : "public, s-maxage=1800, stale-while-revalidate=3600" }) }
  );
}
