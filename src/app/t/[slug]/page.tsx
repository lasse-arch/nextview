import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Experience } from "@/app/(app)/tour-lab/[slug]/experience";
import { loadTour } from "@/app/(app)/tour-lab/[slug]/load";
import type { TourConfig } from "@/app/(app)/tour-lab/tours/types";

/*
 * A published tour, for anyone - made to sit in an iframe on the customer's
 * own website (see the editor's "Del" tab for the code). Only tours marked
 * published are shown; the setup is read fresh, so a saved change is live at once.
 */

export const dynamic = "force-dynamic";

async function published(slug: string): Promise<TourConfig | null> {
  const row = await prisma.tour.findUnique({ where: { slug }, select: { slug: true, config: true, published: true } });
  return row?.published ? { ...(row.config as unknown as TourConfig), slug: row.slug } : null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const tour = await published((await params).slug);
  if (!tour) return { title: "Tour" };
  const icon = tour.favicon || tour.logo;
  return { title: `${tour.title} – virtuel tour`, icons: icon ? { icon, apple: icon } : undefined };
}

export default async function PublicTourPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const setup = await published(slug);
  if (!setup) {
    // An address the tour had before its pretty-URL was changed.
    const moved = await prisma.tour.findFirst({ where: { oldSlugs: { has: slug } }, select: { slug: true } });
    if (moved) redirect(`/t/${moved.slug}`);
    notFound();
  }
  const data = await loadTour(setup);
  return <Experience {...data} phone={/Android|iPhone|iPad|iPod|Mobile/i.test((await headers()).get("user-agent") ?? "")} />;
}
