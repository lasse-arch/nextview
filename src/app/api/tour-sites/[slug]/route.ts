import { NextResponse } from "next/server";
import { teamSeesTour } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { tourCors } from "@/lib/tour-cors";
import { nextStayFree, stayProblem } from "@/lib/availability/next-stay";
import type { TourConfig } from "@/app/arpo/tour-lab/tours/types";

/*
 * "Pladskort": which of a campsite tour's pitches and cabins are free for the
 * dates the visitor picked (?fra=YYYY-MM-DD&til=YYYY-MM-DD). Public and
 * read-only, for published tours - and for the team's preview of one not
 * yet published. Only the booking stored on the tour is asked, only the ids
 * of the tour's own units come back, and each address gets a limited number
 * of asks a minute (the answers are cached in lib/availability/next-stay.ts).
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
  const q = new URL(request.url).searchParams;
  const from = q.get("fra") ?? "";
  const to = q.get("til") ?? "";
  const problem = stayProblem(from, to);
  if (problem) return NextResponse.json({ error: problem }, { status: 400, headers: tourCors(request) });

  const tour = await prisma.tour.findUnique({ where: { slug: String(slug) }, select: { config: true, published: true } });
  const plan = tour ? (tour.config as unknown as TourConfig).sitePlan : undefined;
  const team = tour && !tour.published ? Boolean(await teamSeesTour(slug)) : false;
  if (!tour || (!tour.published && !team) || !plan?.nextStay || !plan.units?.length) return NextResponse.json({ error: "Ikke fundet." }, { status: 404, headers: tourCors(request) });

  try {
    const free = new Set(await nextStayFree(plan.nextStay.tenantId, from, to));
    // Only the tour's own units - nothing else from the booking system leaves here.
    const ids = plan.units.map((u) => u.id).filter((id) => free.has(id));
    return NextResponse.json({ free: ids }, { headers: tourCors(request, { "Cache-Control": team ? "private, no-store" : "public, s-maxage=120, stale-while-revalidate=300" }) });
  } catch {
    return NextResponse.json({ error: "Bookingen svarer ikke lige nu - prøv igen om lidt." }, { status: 502, headers: tourCors(request) });
  }
}
