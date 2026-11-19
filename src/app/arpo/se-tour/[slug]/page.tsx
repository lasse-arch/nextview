import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { Viewport } from "next";
import { teamSeesTour } from "@/lib/auth";
import { getTourConfig } from "@/lib/tours";
import { Experience } from "../../tour-lab/[slug]/experience";
import { loadTour } from "../../tour-lab/[slug]/load";

export const viewport: Viewport = { viewportFit: "cover", themeColor: "#0d1b20", width: "device-width", initialScale: 1, minimumScale: 1, maximumScale: 1, userScalable: false };
export const metadata = { title: "Se touren", robots: { index: false, follow: false } };

/*
 * A tour as it is now - also one still being built - for the sellers (Online
 * kunder → Tours i gang): the latest saved version, just to look at. No
 * editor, nothing to change, not counted in the customer's statistics (the
 * engine counts nothing under /arpo). The team only: sellers and admins any
 * tour, developers the ones given to them; never public.
 */
export default async function SeeTourPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ sprog?: string }> }) {
  const slug = (await params).slug;
  if (!(await teamSeesTour(slug))) redirect("/arpo");
  const setup = await getTourConfig(slug);
  if (!setup) notFound();
  const data = await loadTour(setup);
  const h = await headers();
  return (
    <>
      <Experience {...data} lang={(await searchParams).sprog} country={h.get("x-vercel-ip-country") ?? undefined} phone={/Android|iPhone|iPad|iPod|Mobile/i.test(h.get("user-agent") ?? "")} />
      <div className="pointer-events-none fixed bottom-3 left-1/2 z-[70] -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-[11px] font-medium text-white">Under arbejde - kun til internt brug</div>
    </>
  );
}

export const dynamic = "force-dynamic";
