import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Experience } from "@/app/(app)/tour-lab/[slug]/experience";
import { loadTour } from "@/app/(app)/tour-lab/[slug]/load";
import type { TourConfig } from "@/app/(app)/tour-lab/tours/types";

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
  const setup = await byToken(token);
  if (!setup) notFound();
  const data = await loadTour(setup);
  return <Experience {...data} lang={(await searchParams).sprog} review={token} phone={/Android|iPhone|iPad|iPod|Mobile/i.test((await headers()).get("user-agent") ?? "")} />;
}
