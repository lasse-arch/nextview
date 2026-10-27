import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canEmbed } from "@/lib/link-embed";
import { tourCors } from "@/lib/tour-cors";

/*
 * Whether a link can open in a popup over a tour (its site may refuse to be
 * shown inside another - then the tour opens it in a new tab). Public and
 * read-only, for published tours, and only for a link that's in the tour's own
 * setup - so it can't be used to make us fetch anything else. The team's
 * editor preview may ask about any web address (a link not saved yet), never
 * a local one. Answers are cached for a day; each address gets a limited
 * number of asks a minute.
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
  return ++a.n > 60;
}

/** A web address on the open internet (not localhost, a bare IP or an internal name). */
function publicWebAddress(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || !h.includes(".") || /^[\d.]+$/.test(h) || h.includes(":") || /\.(local|internal|lan|home|corp)$/.test(h)) return null;
    return u;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  if (tooMany(request)) return new NextResponse(null, { status: 429, headers: tourCors(request, { "Retry-After": "60" }) });
  const q = new URL(request.url).searchParams;
  const url = (q.get("url") ?? "").slice(0, 2000);
  const slug = q.get("tour") ?? "";
  if (!publicWebAddress(url) || !slug) return NextResponse.json({ ok: true }, { status: 400, headers: tourCors(request) });
  const tour = await prisma.tour.findUnique({ where: { slug }, select: { config: true, published: true } });
  // As written in the setup (a bare address may have got a "/" on the way).
  const setup = tour?.published ? JSON.stringify(tour.config) : "";
  const inSetup = [url, url.replace(/\/$/, "")].some((u) => setup.includes(`"${JSON.stringify(u).slice(1, -1)}"`));
  const team = inSetup ? false : Boolean(await getCurrentUser());
  if (!inSetup && !team) return NextResponse.json({ ok: true }, { status: 404, headers: tourCors(request) });
  const ok = await canEmbed(url);
  return NextResponse.json({ ok }, { headers: tourCors(request, { "Cache-Control": inSetup ? "public, s-maxage=86400, stale-while-revalidate=86400" : "private, max-age=3600" }) });
}
