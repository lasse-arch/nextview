import "server-only";
import { tourOfReviewToken } from "@/lib/review-tokens";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Experience } from "@/app/arpo/tour-lab/[slug]/experience";
import { reviewTour } from "@/lib/tour-cache";
import type { TourConfig } from "@/app/arpo/tour-lab/tours/types";

/*
 * Kundegennemsyn: the tour as it is in Arpo right now (published or not) on a
 * secret link we switch on and off in the editor ("Del og udgiv"), with
 * "Giv feedback" in it. Switched off, the link is gone. Two forms, the same
 * page: /p/<token> (the first links sent) and /p/<tour>/<token> (with the
 * tour's name in front - the secret part as long as before, as the link can
 * approve the tour).
 */

async function byToken(token: string): Promise<TourConfig | null> {
  const hit = await tourOfReviewToken(token);
  const row = hit ? await prisma.tour.findUnique({ where: { slug: hit.slug }, select: { slug: true, config: true } }) : null;
  return row ? { ...(row.config as unknown as TourConfig), slug: row.slug } : null;
}

export async function reviewMetadata(token: string): Promise<Metadata> {
  const tour = await byToken(token);
  if (!tour) return { title: "Tour" };
  const icon = tour.favicon || tour.logo;
  return { title: `${tour.title} – gennemsyn`, robots: { index: false, follow: false }, icons: icon ? { icon, shortcut: icon, apple: icon } : undefined };
}

/** The review page for a token - with the tour's name in the link (`slug`), it must be that tour's (else to its right name). */
export async function ReviewPage({ token, slug, sprog }: { token: string; slug?: string; sprog?: string }) {
  if (slug) {
    const hit = await tourOfReviewToken(token);
    if (!hit) notFound();
    if (hit.slug !== slug) redirect(`/p/${hit.slug}/${token}${sprog ? `?sprog=${encodeURIComponent(sprog)}` : ""}`);
  }
  const data = await reviewTour(token);
  if (!data) notFound();
  const h = await headers();
  return <Experience {...data} lang={sprog} review={token} country={h.get("x-vercel-ip-country") ?? undefined} phone={/Android|iPhone|iPad|iPod|Mobile/i.test(h.get("user-agent") ?? "")} />;
}
