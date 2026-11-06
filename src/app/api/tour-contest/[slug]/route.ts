import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { teamSeesTour } from "@/lib/auth";
import { tourCors } from "@/lib/tour-cors";
import { contestChests, contestOpen } from "@/lib/tour-contest";
import type { TourConfig } from "@/app/arpo/tour-lab/tours/types";

/*
 * "Skattejagt": an entry to a treasure chest's draw. Public (the tour is), so
 * guarded as the contact form is - a hidden field robots fill in and a form
 * sent faster than a person writes one are thanked and dropped; at most 5
 * entries per visitor per half hour and 300 per tour an hour; lengths are
 * limited. Only for a chest that is in the published tour (or the team's own
 * preview - kept as a test) and whose draw hasn't closed. One entry per
 * e-mail per chest. The IP is kept only as a salted hash, to limit entries.
 */

const EMAIL = /^[^\s@<>",;?&]+@[^\s@<>",;?&]+\.[^\s@<>",;?&]+$/;
const sent = new Map<string, number[]>();
function used(key: string, ms: number): number {
  const now = Date.now();
  const list = (sent.get(key) ?? []).filter((t) => now - t < ms);
  sent.set(key, list);
  return list.length;
}
function count(...keys: string[]) {
  if (sent.size > 20_000) sent.clear();
  for (const k of keys) sent.set(k, [...(sent.get(k) ?? []), Date.now()]);
}
const PER_VISITOR = { max: 5, ms: 1_800_000 };
const PER_TOUR = { max: 300, ms: 3_600_000 };
const tries = new Map<string, number[]>();
function hammering(ip: string): boolean {
  const now = Date.now();
  const list = (tries.get(ip) ?? []).filter((t) => now - t < 600_000);
  if (tries.size > 20_000) tries.clear();
  tries.set(ip, [...list, now]);
  return list.length >= 30;
}
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");

export function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: tourCors(request, { "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "content-type", "Access-Control-Max-Age": "86400" }) });
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const headers = tourCors(request);
  const fail = (error: string, status = 400) => NextResponse.json({ error }, { status, headers });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return fail("Det kunne ikke læses.");
  // Robots: thanked - and dropped.
  if (clean(body.website, 200) || (typeof body.ms === "number" && body.ms < 2500)) return NextResponse.json({ ok: true }, { headers });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "ukendt";
  const slug = (await params).slug;
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return fail("Touren findes ikke.", 404);
  if (hammering(ip) || used(`ip:${ip}`, PER_VISITOR.ms) >= PER_VISITOR.max || used(`tour:${slug}`, PER_TOUR.ms) >= PER_TOUR.max) return fail("Der er sendt mange lige nu - prøv igen om lidt.", 429);

  const itemId = clean(body.itemId, 80);
  const name = clean(body.name, 100);
  const email = clean(body.email, 200).toLowerCase();
  const phone = clean(body.phone, 30);
  const grade = body.grade === "9" || body.grade === "10" ? body.grade : null;
  if (!name || !EMAIL.test(email) || phone.replace(/\D/g, "").length < 8) return fail("Udfyld navn, e-mail og telefon.");
  if (body.consent !== true) return fail("Sæt flueben ved, at oplysningerne må gemmes til lodtrækningen.");

  const tour = await prisma.tour.findUnique({ where: { slug }, select: { config: true, published: true, liveVersion: true } });
  const test = !(tour?.published || tour?.liveVersion != null) && Boolean(await teamSeesTour(slug));
  if (!tour || (!tour.published && tour.liveVersion == null && !test)) return fail("Lodtrækningen findes ikke.", 404);
  const chest = contestChests(tour.config as unknown as TourConfig).find((c) => c.id === itemId);
  if (!chest) return fail("Lodtrækningen findes ikke.", 404);
  if (!contestOpen(chest.contest)) return fail("Lodtrækningen er slut.", 410);

  const ipHash = createHash("sha256").update(`${process.env.AUTH_SECRET ?? ""}:${ip}`).digest("hex").slice(0, 32);
  try {
    await prisma.tourContestEntry.create({ data: { tourSlug: slug, itemId, name, email, phone, grade, infoOk: body.infoOk === true, test, ipHash } });
  } catch (err) {
    // The same e-mail once more: already in the draw.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return NextResponse.json({ ok: true, already: true }, { headers });
    console.error("[tour-contest]", slug, err instanceof Error ? err.message : err);
    return fail("Det kunne ikke gemmes lige nu.", 502);
  }
  count(`ip:${ip}`, `tour:${slug}`);
  return NextResponse.json({ ok: true }, { headers });
}
