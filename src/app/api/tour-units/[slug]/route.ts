import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchBoxdepotetUnits } from "@/lib/availability/boxdepotet";
import { tourCors } from "@/lib/tour-cors";
import type { TourConfig } from "@/app/arpo/tour-lab/tours/types";

/*
 * The free rooms for a published tour's room picker - for a tour published
 * as plain files, which fetches them once it has opened (the rooms in its
 * files are from when it was published). Only published tours, read from the
 * address in the tour's own setup (never one from the request), and cached
 * for 10 minutes so visitors don't reach the customer's site.
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const tour = await prisma.tour.findUnique({ where: { slug: (await params).slug }, select: { config: true, published: true } });
  const availability = tour?.published ? (tour.config as unknown as TourConfig).availability : undefined;
  if (!availability) return NextResponse.json({ units: [] }, { headers: tourCors(request) });
  const units = await fetchBoxdepotetUnits(availability.url).catch(() => null);
  if (!units) return NextResponse.json({ units: null }, { status: 502, headers: tourCors(request) });
  return NextResponse.json({ units }, { headers: tourCors(request, { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=600" }) });
}
