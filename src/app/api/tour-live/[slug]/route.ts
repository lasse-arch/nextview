import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchLiveUnits, refreshSeconds } from "@/lib/availability/live";
import { tourCors } from "@/lib/tour-cors";
import type { TourConfig } from "@/app/arpo/tour-lab/tours/types";

/*
 * A tour's live units (free pitches, rooms …), fetched by the tour after it
 * has opened - so the tour never waits for the customer's site. Read from
 * the customer's page at most once per the tour's refresh time and served
 * from cache in between; public, as the units are on the customer's own
 * public page anyway.
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const tour = await prisma.tour.findUnique({ where: { slug: (await params).slug }, select: { config: true } });
  const live = (tour?.config as unknown as TourConfig | undefined)?.live;
  if (!live) return NextResponse.json({ units: [] }, { headers: tourCors(request) });
  const ttl = refreshSeconds(live);
  return NextResponse.json({ units: await fetchLiveUnits(live) }, { headers: tourCors(request, { "Cache-Control": `public, s-maxage=${ttl}, stale-while-revalidate=${ttl}` }) });
}
