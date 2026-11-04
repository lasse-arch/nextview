import { NextResponse } from "next/server";
import { teamSeesTour } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { tourCors } from "@/lib/tour-cors";
import { stayProblem } from "@/lib/availability/next-stay";
import { nightsOf, readShopProduct, shopPrice } from "@/lib/availability/webshop";
import type { TourConfig } from "@/app/arpo/tour-lab/tours/types";

/*
 * "Vælg datoer" on a point's card (TourPoint.shop): the days a webshop product
 * can be booked, and the shop's price for a stay. Public and read-only, for
 * published tours (and the team's preview of one not yet published). Only the
 * product stored on that point of the tour is ever read - the address never
 * comes from the visitor - and each address gets a limited number of asks a
 * minute. Nothing is put in a basket or booked: Book opens the shop itself.
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

/** The point's shop address - only from the tour itself. */
async function shopOf(slug: string, point: string): Promise<{ url: string; team: boolean } | null> {
  const tour = await prisma.tour.findUnique({ where: { slug: String(slug) }, select: { config: true, published: true } });
  if (!tour) return null;
  const team = !tour.published ? Boolean(await teamSeesTour(slug)) : false;
  if (!tour.published && !team) return null;
  const c = tour.config as unknown as TourConfig;
  // "_tour": the tour's own "Book ophold" (TourConfig.shop) - else a point's.
  const url = point === "_tour" ? c.shop?.url : c.points?.find((p) => p.id === point)?.shop?.url;
  return url ? { url, team } : null;
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: tourCors(request) });
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (tooMany(request)) return NextResponse.json({ error: "For mange forespørgsler - prøv igen om lidt." }, { status: 429, headers: tourCors(request, { "Retry-After": "60" }) });
  const point = new URL(request.url).searchParams.get("punkt") ?? "";
  const shop = await shopOf((await params).slug, point);
  if (!shop) return NextResponse.json({ error: "Ikke fundet." }, { status: 404, headers: tourCors(request) });
  try {
    const p = await readShopProduct(shop.url);
    return NextResponse.json(
      { name: p.name, dates: p.dates, basePrice: p.basePrice, guests: p.guests },
      { headers: tourCors(request, { "Cache-Control": shop.team ? "private, no-store" : "public, s-maxage=300, stale-while-revalidate=600" }) }
    );
  } catch {
    return NextResponse.json({ error: "Webshoppen svarer ikke lige nu - prøv igen om lidt." }, { status: 502, headers: tourCors(request) });
  }
}

/** The price of a stay: { punkt, fra, til, gaester: { [id]: antal } } → { ok (every night free), price }. */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (tooMany(request)) return NextResponse.json({ error: "For mange forespørgsler - prøv igen om lidt." }, { status: 429, headers: tourCors(request, { "Retry-After": "60" }) });
  const body = (await request.json().catch(() => null)) as { punkt?: unknown; fra?: unknown; til?: unknown; gaester?: unknown } | null;
  const from = String(body?.fra ?? "");
  const to = String(body?.til ?? "");
  const problem = stayProblem(from, to);
  if (problem) return NextResponse.json({ error: problem }, { status: 400, headers: tourCors(request) });
  const shop = await shopOf((await params).slug, String(body?.punkt ?? ""));
  if (!shop) return NextResponse.json({ error: "Ikke fundet." }, { status: 404, headers: tourCors(request) });
  try {
    const p = await readShopProduct(shop.url);
    const raw = body?.gaester && typeof body.gaester === "object" ? (body.gaester as Record<string, unknown>) : {};
    // Only the product's own guest kinds, whole numbers within its limits.
    const guests = Object.fromEntries(p.guests.map((g) => [g.id, Math.max(0, Math.min(g.max, Math.floor(Number(raw[g.id]) || 0)))]));
    // Their calendar: every day of the stay - arrival to departure - must be one that can be chosen.
    const free = new Set(p.dates);
    const ok = [...nightsOf(from, to), to].every((d) => free.has(d));
    const price = ok ? await shopPrice(shop.url, p, from, to, guests).catch(() => null) : null;
    return NextResponse.json({ ok, price }, { headers: tourCors(request, { "Cache-Control": "private, no-store" }) });
  } catch {
    return NextResponse.json({ error: "Webshoppen svarer ikke lige nu - prøv igen om lidt." }, { status: 502, headers: tourCors(request) });
  }
}
