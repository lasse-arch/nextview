import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { requireTour } from "@/lib/auth";
import { getTourConfig } from "@/lib/tours";
import { Experience } from "./experience";
import { loadTour } from "./load";
import type { Viewport } from "next";

/** The tour fills the whole phone screen, also behind the island (its buttons keep clear of it - safe-area insets). */
export const viewport: Viewport = { viewportFit: "cover", themeColor: "#0d1b20" };

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const tour = await getTourConfig((await params).slug);
  const icon = tour ? tour.favicon || tour.logo : null;
  return { title: tour ? `${tour.brand} – prototype` : "Tour-lab", icons: icon ? { icon, shortcut: icon, apple: icon } : undefined };
}

/** A tour in Arpo - the editor's preview and the admins' own view, with the prototype tools. The public one is /t/<slug>. */
export default async function TourPrototypePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ sprog?: string }> }) {
  const slug = (await params).slug;
  // Only a tour this person may work on (developers: the ones given to them).
  if (!(await requireTour(slug).catch(() => null))) redirect("/arpo/tour-lab");
  const setup = await getTourConfig(slug);
  if (!setup) notFound();
  const data = await loadTour(setup);
  return <Experience {...data} lang={(await searchParams).sprog} country={(await headers()).get("x-vercel-ip-country") ?? undefined} tools phone={/Android|iPhone|iPad|iPod|Mobile/i.test((await headers()).get("user-agent") ?? "")} />;
}
