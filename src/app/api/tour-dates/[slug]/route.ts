import { NextResponse } from "next/server";
import { teamSeesTour } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { tourCors } from "@/lib/tour-cors";
import { zenbiEvents } from "@/lib/availability/zenbi";
import type { TourConfig } from "@/app/arpo/tour-lab/tours/types";

/*
 * "Næste rundvisninger" (TourConfig.events): the coming dates of the tour's own
 * sign-up form. Public and read-only, for published tours (and the team's
 * preview); only the form stored on the tour is read, rate-limited per address.
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
  return ++a.n > 20;
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: tourCors(request) });
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (tooMany(request)) return NextResponse.json({ error: "For mange forespørgsler - prøv igen om lidt." }, { status: 429, headers: tourCors(request, { "Retry-After": "60" }) });
  const slug = (await params).slug;
  const tour = await prisma.tour.findUnique({ where: { slug: String(slug) }, select: { config: true, published: true } });
  const team = tour && !tour.published ? Boolean(await teamSeesTour(slug)) : false;
  const ev = tour ? (tour.config as unknown as TourConfig).events : undefined;
  if (!tour || (!tour.published && !team) || !ev?.source) return NextResponse.json({ error: "Ikke fundet." }, { status: 404, headers: tourCors(request) });
  try {
    const events = (await zenbiEvents(ev.source, ev.field)).slice(0, Math.max(1, Math.min(8, ev.max ?? 3)));
    return NextResponse.json({ events }, { headers: tourCors(request, { "Cache-Control": team ? "private, no-store" : "public, s-maxage=300, stale-while-revalidate=600" }) });
  } catch {
    return NextResponse.json({ error: "Tilmeldingen svarer ikke lige nu." }, { status: 502, headers: tourCors(request) });
  }
}
