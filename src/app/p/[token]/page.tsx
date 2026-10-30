import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Experience } from "@/app/arpo/tour-lab/[slug]/experience";
import { reviewTour } from "@/lib/tour-cache";
import type { TourConfig } from "@/app/arpo/tour-lab/tours/types";
import type { Viewport } from "next";

/** The tour fills the whole phone screen, also behind the island (its buttons keep clear of it - safe-area insets). */
export const viewport: Viewport = { viewportFit: "cover", themeColor: "#0d1b20" };

/*
 * Kundegennemsyn: the tour as it is in Arpo right now (published or not) on a
 * secret link we switch on and off in the editor ("Del og udgiv"), with
 * "Giv feedback" in it. Switched off, the link is gone.
 */

export const dynamic = "force-dynamic";

async function byToken(token: string): Promise<TourConfig | null> {
  const row = await prisma.tour.findUnique({ where: { reviewToken: token }, select: { slug: true, config: true } });
  return row ? { ...(row.config as unknown as TourConfig), slug: row.slug } : null;
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const tour = await byToken((await params).token);
  if (!tour) return { title: "Tour" };
  const icon = tour.favicon || tour.logo;
  return { title: `${tour.title} – gennemsyn`, robots: { index: false, follow: false }, icons: icon ? { icon, shortcut: icon, apple: icon } : undefined };
}

export default async function ReviewTourPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ sprog?: string }> }) {
  const { token } = await params;
  const data = await reviewTour(token);
  if (!data) notFound();
  const h = await headers();
  return <Experience {...data} lang={(await searchParams).sprog} review={token} country={h.get("x-vercel-ip-country") ?? undefined} phone={/Android|iPhone|iPad|iPod|Mobile/i.test(h.get("user-agent") ?? "")} />;
}
