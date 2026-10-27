import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { approveTour } from "@/lib/tour-review";

/*
 * "Godkend touren" from a tour's review link (/p/<token>): open to anyone
 * with the link, like its feedback - the token is checked every time, and
 * approving is once only (again changes nothing), so there's nothing to flood.
 */

async function tourOf(token: unknown) {
  if (typeof token !== "string" || token.length < 10 || token.length > 64) return null;
  return prisma.tour.findUnique({ where: { reviewToken: token }, select: { slug: true, reviewApprovedAt: true } });
}

export async function GET(request: Request) {
  const tour = await tourOf(new URL(request.url).searchParams.get("token"));
  if (!tour) return NextResponse.json({ error: "Linket virker ikke længere." }, { status: 404 });
  // Only whether it's approved - not who (the link can be passed around).
  return NextResponse.json({ approvedAt: tour.reviewApprovedAt });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const tour = await tourOf(body?.token);
  if (!tour) return NextResponse.json({ error: "Linket virker ikke længere." }, { status: 404 });
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : "";
  await approveTour(tour.slug, { name, customer: true });
  return NextResponse.json({ ok: true });
}
