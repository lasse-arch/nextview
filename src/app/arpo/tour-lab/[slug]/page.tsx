import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getTourConfig } from "@/lib/tours";
import { Experience } from "./experience";
import { loadTour } from "./load";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const tour = await getTourConfig((await params).slug);
  const icon = tour ? tour.favicon || tour.logo : null;
  return { title: tour ? `${tour.brand} – prototype` : "Tour-lab", icons: icon ? { icon, shortcut: icon, apple: icon } : undefined };
}

/** A tour in Arpo - the editor's preview and the admins' own view, with the prototype tools. The public one is /t/<slug>. */
export default async function TourPrototypePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ sprog?: string }> }) {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") redirect("/arpo");
  const setup = await getTourConfig((await params).slug);
  if (!setup) notFound();
  const data = await loadTour(setup);
  return <Experience {...data} lang={(await searchParams).sprog} tools phone={/Android|iPhone|iPad|iPod|Mobile/i.test((await headers()).get("user-agent") ?? "")} />;
}
