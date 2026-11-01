import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { approveTour } from "@/lib/tour-review";
import { tourOfReviewToken } from "@/lib/review-tokens";

/*
 * "Godkend touren" from a tour's review link (/p/<token>). Only the review
 * link proper may approve (it's mailed to the one who approves) - the
 * notes-only link (reviewNoteToken: a customer's staff without the right, our
 * developers) can't. Approving is once only (again changes nothing).
 */

async function tourOf(token: unknown) {
  const hit = await tourOfReviewToken(token);
  if (!hit) return null;
  const tour = await prisma.tour.findUnique({ where: { slug: hit.slug }, select: { slug: true, reviewApprovedAt: true } });
  return tour ? { ...tour, canApprove: hit.canApprove } : null;
}

export async function GET(request: Request) {
  const tour = await tourOf(new URL(request.url).searchParams.get("token"));
  if (!tour) return NextResponse.json({ error: "Linket virker ikke længere." }, { status: 404 });
  // Only whether it's approved - not who (the link can be passed around) - and whether this link may approve.
  return NextResponse.json({ approvedAt: tour.reviewApprovedAt, canApprove: tour.canApprove });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const tour = await tourOf(body?.token);
  if (!tour) return NextResponse.json({ error: "Linket virker ikke længere." }, { status: 404 });
  if (!tour.canApprove) return NextResponse.json({ error: "Dette link kan kun bruges til rettelser - godkendelsen sker fra linket i mailen." }, { status: 403 });
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : "";
  await approveTour(tour.slug, { name, customer: true });
  return NextResponse.json({ ok: true });
}
