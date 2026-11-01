import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";

/*
 * Two links into a tour's review mode (/p/<token>): the review link proper
 * (reviewToken), mailed to the one who approves - it can write notes AND
 * approve, which puts the tour live and starts billing; and a notes-only link
 * (reviewNoteToken) for everyone else who may look and comment but not approve:
 * a customer's staff without the right, and our own developers.
 */

/** The tour a review link opens, and whether that link may approve it. */
export async function tourOfReviewToken(token: unknown): Promise<{ slug: string; canApprove: boolean } | null> {
  if (typeof token !== "string" || token.length < 8 || token.length > 64) return null;
  const full = await prisma.tour.findUnique({ where: { reviewToken: token }, select: { slug: true } });
  if (full) return { slug: full.slug, canApprove: true };
  const notes = await prisma.tour.findUnique({ where: { reviewNoteToken: token }, select: { slug: true } });
  return notes ? { slug: notes.slug, canApprove: false } : null;
}

/** The notes-only link of a tour (made the first time), or null when review is off (no review link at all). */
export async function noteTokenOf(slug: string): Promise<string | null> {
  const tour = await prisma.tour.findUnique({ where: { slug }, select: { reviewToken: true, reviewNoteToken: true } });
  if (!tour?.reviewToken) return null;
  if (tour.reviewNoteToken) return tour.reviewNoteToken;
  const token = randomBytes(12).toString("base64url");
  await prisma.tour.update({ where: { slug }, data: { reviewNoteToken: token } });
  return token;
}
