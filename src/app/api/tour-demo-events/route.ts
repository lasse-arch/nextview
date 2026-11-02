import { NextResponse, type NextRequest } from "next/server";
import { getTeamUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ringBell } from "@/lib/team-notifications";

/*
 * What a new customer does on a showcase link (/vis/<token>): the engine sends
 * its events here instead of to /api/tour-events, so they never mix with the
 * tour's own numbers. Public, so: only a live link's token, a handful of
 * short fields, a capped batch, a limited number of batches a minute per
 * address - and our own team's openings aren't kept. Where the visitor was is
 * the town and country Vercel reads from the request; the IP itself is never
 * stored. The page they came from is kept as its host only.
 */

const asks = new Map<string, { at: number; n: number }>();
function tooMany(ip: string): boolean {
  const now = Date.now();
  const a = asks.get(ip);
  if (!a || now - a.at > 60_000) {
    if (asks.size > 5000) asks.clear();
    asks.set(ip, { at: now, n: 1 });
    return false;
  }
  return ++a.n > 40;
}

const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const header = (request: NextRequest, name: string) => {
  const v = request.headers.get(name);
  if (!v) return null;
  try {
    return decodeURIComponent(v).slice(0, 80);
  } catch {
    return v.slice(0, 80);
  }
};

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "ukendt";
  if (tooMany(ip)) return new NextResponse(null, { status: 429 });
  const raw = await request.text();
  if (raw.length > 20_000) return new NextResponse(null, { status: 413 });
  let body: { token?: unknown; session?: unknown; device?: unknown; ref?: unknown; events?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const token = text(body.token, 64);
  const session = text(body.session, 40);
  if (!token || !session || !Array.isArray(body.events)) return new NextResponse(null, { status: 400 });
  const link = await prisma.tourDemoLink.findUnique({ where: { token }, select: { id: true, disabledAt: true, tourSlug: true, createdById: true, dealId: true, deal: { select: { companyName: true, displayName: true } } } });
  if (!link || link.disabledAt) return new NextResponse(null, { status: 404 });
  // We looked at it ourselves (checking the link before sending it): not a visit.
  if (await getTeamUser().catch(() => null)) return new NextResponse(null, { status: 204 });
  const device = body.device === "mobil" ? "mobil" : "computer";
  const ref = typeof body.ref === "string" && /^[a-z0-9.-]{1,100}$/i.test(body.ref) ? body.ref.toLowerCase() : null;
  const city = header(request, "x-vercel-ip-city");
  const country = header(request, "x-vercel-ip-country");
  const events = body.events
    .slice(0, 50)
    .map((e: { name?: unknown; label?: unknown; value?: unknown }) => ({
      name: text(e?.name, 40),
      label: text(e?.label, 120),
      value: typeof e?.value === "number" && Number.isInteger(e.value) && e.value >= 0 && e.value <= 3600 ? e.value : null,
    }))
    .filter((e): e is { name: string; label: string | null; value: number | null } => Boolean(e.name && /^[a-z_]+$/.test(e.name)));
  if (!events.length) return new NextResponse(null, { status: 204 });
  // A new visit on a link sent to a customer: the seller who sent it hears at once (a good moment to call).
  const first = link.dealId && link.deal && !(await prisma.tourDemoEvent.count({ where: { linkId: link.id, session } }));
  await prisma.tourDemoEvent.createMany({ data: events.map((e) => ({ ...e, linkId: link.id, session, device, city, country, referrer: ref })) });
  if (first) {
    const name = link.deal!.displayName || link.deal!.companyName;
    await ringBell({ kind: "demo", title: `${name} kigger på jeres eksempel lige nu`, text: `De åbnede touren${city ? ` i ${city}` : ""} på ${device}. Et godt tidspunkt at ringe.`, href: `/arpo/deals/${link.dealId}`, tourSlug: `demo:${link.id}`, audience: `user:${link.createdById}` });
  }
  return new NextResponse(null, { status: 204 });
}
