import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { tourCors } from "@/lib/tour-cors";
import { journey, suggestAddresses } from "@/lib/commute";
import type { TourConfig } from "@/app/arpo/tour-lab/tours/types";

/*
 * "Vej til skolen" in a tour: ?q=<text> → addresses, ?lat=&lon= → how long
 * it takes to the tour's place. Public and read-only, for published tours
 * (and the team's preview); the place is always the one stored on the tour,
 * never one the visitor sends. Nothing the visitor types is kept, and each
 * address gets a limited number of asks a minute.
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
  return ++a.n > 40;
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (tooMany(request)) return new NextResponse(null, { status: 429, headers: tourCors(request, { "Retry-After": "60" }) });
  const tour = await prisma.tour.findUnique({ where: { slug: (await params).slug }, select: { config: true, published: true } });
  const stored = tour ? (tour.config as unknown as TourConfig).commute : undefined;
  const q = new URL(request.url).searchParams;
  // The team's editor preview may show a place not saved yet (to=lat,lon) - only for someone logged in to Arpo.
  const to = (q.get("to") ?? "").split(",").map(Number);
  const asked = to.length === 2 && to.every(Number.isFinite) && Math.abs(to[0] - 56) < 3 && Math.abs(to[1] - 11) < 5 ? { lat: to[0], lon: to[1] } : null;
  const same = asked && stored && Math.abs(asked.lat - stored.lat) < 1e-5 && Math.abs(asked.lon - stored.lon) < 1e-5;
  const team = (!tour?.published || (asked && !same)) && tour ? Boolean(await getCurrentUser()) : false;
  const place = asked && !same && team ? asked : tour?.published || team ? stored ?? (team ? asked : undefined) : undefined;
  if (!tour || !place) return NextResponse.json({ error: "Ikke slået til." }, { status: 404, headers: tourCors(request) });
  const priv: Record<string, string> = team ? { "Cache-Control": "private, no-store" } : { "Cache-Control": "private, max-age=300" };
  if (q.has("q")) return NextResponse.json({ suggestions: await suggestAddresses(q.get("q") ?? "") }, { headers: tourCors(request, priv) });
  const lat = Number(q.get("lat"));
  const lon = Number(q.get("lon"));
  if (!(Math.abs(lat - 56) < 3 && Math.abs(lon - 11) < 5)) return NextResponse.json({ error: "Kun adresser i Danmark." }, { status: 400, headers: tourCors(request) });
  const j = await journey([lat, lon], [place.lat, place.lon]);
  if (!j) return NextResponse.json({ error: "Kunne ikke finde vejen lige nu." }, { status: 502, headers: tourCors(request, priv) });
  return NextResponse.json(j, { headers: tourCors(request, priv) });
}
