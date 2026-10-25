import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettingValue } from "@/lib/integration-settings";
import { canEmbed } from "@/lib/link-embed";
import { fetchMpskinsCfg, hiddenSweeps, ssOf, sweepForSs } from "@/lib/mpskins";
import { TOURS } from "../tours";
import type { TourConfig } from "../tours/types";
import { Experience } from "./experience";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const tour = TOURS[(await params).slug];
  return { title: tour ? `${tour.brand} – prototype` : "Tour-lab" };
}

/**
 * A prototype tour: one engine (experience.tsx), one setup per customer
 * (../tours). The scan points behind every link are looked up once here,
 * from the current MPSkins tour's own config.
 */
export default async function TourPrototypePage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") redirect("/");
  const setup = TOURS[(await params).slug];
  if (!setup) notFound();
  const tour = await withPopupFallback(setup);

  const [sdkKey, ga4Id, cfg, storyImages] = await Promise.all([
    getSettingValue("MATTERPORT_SDK_KEY"),
    getSettingValue("TOUR_PROTOTYPE_GA4_ID"),
    fetchMpskinsCfg(tour.tourPage).catch(() => null),
    prisma.tourStoryImage.findMany({ where: { tourSlug: tour.slug }, select: { room: true, updatedAt: true } }),
  ]);
  // The story cards' pictures: room name -> URL (versioned, so a retaken picture shows at once).
  const storyImageUrls = Object.fromEntries(
    storyImages.map((s) => [s.room, `/tour-lab/${tour.slug}/historie?rum=${encodeURIComponent(s.room)}&v=${s.updatedAt.getTime()}`])
  );

  const links = [
    tour.start,
    ...tour.points.map((p) => p.tour).filter((t): t is string => Boolean(t)),
    ...tour.menu.flatMap((m) => ("items" in m ? m.items.map((i) => i[1]) : [m.href])),
    ...(tour.welcome?.tiles.flatMap((t) => ("room" in t.go ? [t.go.room] : [])) ?? []),
    ...(tour.places?.map((p) => p.href) ?? []),
  ];
  const sweepBySs: Record<number, string> = {};
  for (const link of links) {
    const ss = ssOf(link);
    const sweep = cfg ? sweepForSs(cfg, ss) : null;
    if (ss != null && sweep) sweepBySs[ss] = sweep;
  }

  // Scan points hidden in MPSkins stay hidden here (plus any listed in the tour setup).
  const hidden = [...new Set([...(cfg ? hiddenSweeps(cfg) : []), ...tour.hiddenSweeps])];

  return (
    <Experience tour={tour} sdkKey={sdkKey} ga4Id={ga4Id} modelId={cfg?.mpModel ?? null} sweepBySs={sweepBySs} hiddenSweeps={hidden} storyImages={storyImageUrls} />
  );
}

/** Links set to open in a popup, whose site refuses to be shown inside ours, open in a new tab instead. */
async function withPopupFallback(tour: TourConfig): Promise<TourConfig> {
  const L = tour.linkOpen;
  if (!L) return tour;
  const hrefs = [
    ...tour.cta.map((c) => c.href),
    ...(tour.dock ?? []).flatMap((d) => (d.go === "places" ? [] : [d.go.href])),
    ...tour.menu.flatMap((m) => ("items" in m ? m.items.map((i) => i[1]) : [m.href])),
    ...(tour.welcome?.tiles.flatMap((t) => ("href" in t.go ? [t.go.href] : [])) ?? []),
    tour.contact?.mapUrl,
    tour.contact?.instagram,
  ].filter((h): h is string => Boolean(h) && /^https?:/.test(h!) && !h!.includes("explore.nextview360.dk"));
  const popups = [...new Set(hrefs)].filter((h) => (L.byUrl?.[h] ?? L.default) === "popup");
  const blocked = (await Promise.all(popups.map(async (h) => ((await canEmbed(h)) ? null : h)))).filter((h): h is string => h != null);
  if (!blocked.length) return tour;
  return { ...tour, linkOpen: { ...L, byUrl: { ...L.byUrl, ...Object.fromEntries(blocked.map((h) => [h, "tab" as const])) } } };
}
