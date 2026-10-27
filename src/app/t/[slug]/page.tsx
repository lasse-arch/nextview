import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { publicTour } from "@/lib/tour-cache";
import { Experience } from "@/app/arpo/tour-lab/[slug]/experience";
import type { Viewport } from "next";

/** The tour fills the whole phone screen, also behind the island (its buttons keep clear of it - safe-area insets). */
export const viewport: Viewport = { viewportFit: "cover", themeColor: "#0d1b20" };

/*
 * A published tour, for anyone - made to sit in an iframe on the customer's
 * own website (see the editor's "Del" tab for the code). Only tours marked
 * published are shown. Read through the tour cache (lib/tour-cache.ts): a
 * saved change is live at once, and the tour keeps working if the database
 * is down.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const tour = (await publicTour((await params).slug))?.tour;
  if (!tour) return { title: "Tour" };
  const icon = tour.favicon || tour.logo;
  return { title: `${tour.title} – virtuel tour`, icons: icon ? { icon, shortcut: icon, apple: icon } : undefined };
}

export default async function PublicTourPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ sprog?: string }> }) {
  const { slug } = await params;
  const data = await publicTour(slug);
  if (!data) {
    // An address the tour had before its pretty-URL was changed.
    const moved = await prisma.tour.findFirst({ where: { oldSlugs: { has: slug } }, select: { slug: true } });
    if (moved) redirect(`/t/${moved.slug}`);
    notFound();
  }
  return <Experience {...data} lang={(await searchParams).sprog} phone={/Android|iPhone|iPad|iPod|Mobile/i.test((await headers()).get("user-agent") ?? "")} />;
}
