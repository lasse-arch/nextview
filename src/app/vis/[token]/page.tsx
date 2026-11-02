import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Experience } from "@/app/arpo/tour-lab/[slug]/experience";
import { demoTour } from "@/lib/tour-cache";

/*
 * "Fremvisning": a tour - finished or still being made - shown to a new
 * customer on a secret link we switch on and off in the editor ("Del og
 * udgiv"). It opens with a walk through what the tour can do and ends with
 * who sent it. Read-only: no feedback, no approval, the contact form doesn't
 * send, and it isn't counted in the tour's numbers. Switched off, the link is
 * gone. Each address may open a limited number a minute.
 */

// The tour is a full-screen app: pinching zooms its picture, never the page itself (a pinch on the drone picture made the whole page zoom).
export const viewport: Viewport = { viewportFit: "cover", themeColor: "#0d1b20", width: "device-width", initialScale: 1, minimumScale: 1, maximumScale: 1, userScalable: false };
export const dynamic = "force-dynamic";

const opens = new Map<string, { at: number; n: number }>();
function tooMany(ip: string): boolean {
  const now = Date.now();
  const a = opens.get(ip);
  if (!a || now - a.at > 60_000) {
    if (opens.size > 5000) opens.clear();
    opens.set(ip, { at: now, n: 1 });
    return false;
  }
  return ++a.n > 30;
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const hit = await demoTour((await params).token);
  const tour = hit?.data?.tour;
  if (!tour) return { title: "Tour", robots: { index: false, follow: false } };
  const icon = tour.favicon || tour.logo;
  return { title: `${tour.title} – virtuel tour fra Nextview360`, robots: { index: false, follow: false }, icons: icon ? { icon, shortcut: icon, apple: icon } : undefined };
}

export default async function DemoTourPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ sprog?: string }> }) {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() || "ukendt";
  if (tooMany(ip)) notFound();
  const hit = await demoTour((await params).token);
  if (!hit?.data) notFound();
  return (
    <Experience
      {...hit.data}
      demo={hit.contact}
      lang={(await searchParams).sprog}
      country={h.get("x-vercel-ip-country") ?? undefined}
      phone={/Android|iPhone|iPad|iPod|Mobile/i.test(h.get("user-agent") ?? "")}
    />
  );
}
