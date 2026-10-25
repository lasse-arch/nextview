import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getTourConfig } from "@/lib/tours";
import { Experience } from "./experience";
import { loadTour } from "./load";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const tour = await getTourConfig((await params).slug);
  return { title: tour ? `${tour.brand} – prototype` : "Tour-lab" };
}

/** A tour in Arpo - the editor's preview and the admins' own view, with the prototype tools. The public one is /t/<slug>. */
export default async function TourPrototypePage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") redirect("/");
  const setup = await getTourConfig((await params).slug);
  if (!setup) notFound();
  const data = await loadTour(setup);
  return <Experience {...data} tools phone={/Android|iPhone|iPad|iPod|Mobile/i.test((await headers()).get("user-agent") ?? "")} />;
}
