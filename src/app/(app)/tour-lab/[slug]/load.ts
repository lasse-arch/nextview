import "server-only";
import { prisma } from "@/lib/db";
import { getSettingValue } from "@/lib/integration-settings";
import { canEmbed } from "@/lib/link-embed";
import { fetchSweepGraph, fetchSweepIndex } from "@/lib/matterport-graph";
import { fetchBoxdepotetUnits } from "@/lib/availability/boxdepotet";
import { fetchLiveUnits } from "@/lib/availability/live";
import { fetchMpskinsCfg, hiddenSweeps, ssOf, sweepForSs } from "@/lib/mpskins";
import { isPlaceHref } from "../tours/places";
import type { TourConfig } from "../tours/types";

/**
 * Everything a tour needs besides its setup - for the tour in Arpo and the
 * public one shown in an iframe on the customer's site (/t/<slug>). The scan
 * point behind every link is looked up once here: from the MPSkins tour's
 * config, or from the Matterport model itself for a tour connected straight
 * to Matterport.
 */
export async function loadTour(setup: TourConfig) {
  const tour = await withPopupFallback(setup);
  const [sdkKey, ga4Id, cfg, storyImages] = await Promise.all([
    getSettingValue("MATTERPORT_SDK_KEY"),
    getSettingValue("TOUR_PROTOTYPE_GA4_ID"),
    tour.tourPage ? fetchMpskinsCfg(tour.tourPage).catch(() => null) : Promise.resolve(null),
    prisma.tourStoryImage.findMany({ where: { tourSlug: tour.slug, NOT: { room: { startsWith: "foto:" } } }, select: { room: true, updatedAt: true } }),
  ]);
  const modelId = tour.modelId ?? cfg?.mpModel ?? null;
  // The story cards' pictures: room name -> URL (versioned, so a retaken picture shows at once).
  const storyImageUrls = Object.fromEntries(
    storyImages.map((s) => [s.room, `/tour-lab/${tour.slug}/historie?rum=${encodeURIComponent(s.room)}&v=${s.updatedAt.getTime()}`])
  );

  const sweepBySs: Record<number, string> = {};
  if (cfg) {
    const links = [
      tour.start,
      ...tour.points.map((p) => p.tour).filter((t): t is string => Boolean(t)),
      ...tour.menu.flatMap((m) => ("items" in m ? m.items.map((i) => i[1]) : [m.href])),
      ...(tour.welcome?.tiles.flatMap((t) => ("room" in t.go ? [t.go.room] : [])) ?? []),
      ...(tour.places?.map((p) => p.href) ?? []),
      ...Object.values(tour.wayfinding?.boxes ?? {}),
    ];
    for (const link of links) {
      const ss = ssOf(link);
      const sweep = sweepForSs(cfg, ss);
      if (ss != null && sweep) sweepBySs[ss] = sweep;
    }
    // Every scan point by its number, so the tour always knows where the visitor stands (info points, the placing tool).
    cfg.sweep?.forEach((_, i) => {
      const sweep = sweepForSs(cfg, i + 1);
      if (sweep && !sweepBySs[i + 1]) sweepBySs[i + 1] = sweep;
    });
  } else if (modelId) Object.assign(sweepBySs, await fetchSweepIndex(modelId));

  // Scan points hidden in MPSkins stay hidden here (plus any listed in the tour setup).
  const hidden = [...new Set([...(cfg ? hiddenSweeps(cfg) : []), ...tour.hiddenSweeps])];
  const [units, routeGraph, liveUnits] = await Promise.all([
    tour.availability ? fetchBoxdepotetUnits(tour.availability.url) : Promise.resolve([]),
    tour.wayfinding && modelId ? fetchSweepGraph(modelId) : Promise.resolve(null),
    tour.live ? fetchLiveUnits(tour.live) : Promise.resolve([]),
  ]);
  return { tour, sdkKey, ga4Id, modelId, sweepBySs, hiddenSweeps: hidden, storyImages: storyImageUrls, units, routeGraph, liveUnits };
}

/** Links set to open in a popup, whose site refuses to be shown inside ours, open in a new tab instead. */
async function withPopupFallback(tour: TourConfig): Promise<TourConfig> {
  const L = tour.linkOpen;
  if (!L) return tour;
  const hrefs = [
    ...tour.cta.map((c) => c.href),
    ...(tour.dock ?? []).flatMap((d) => (typeof d.go === "string" ? [] : [d.go.href])),
    ...tour.menu.flatMap((m) => ("items" in m ? m.items.map((i) => i[1]) : [m.href])),
    ...(tour.welcome?.tiles.flatMap((t) => ("href" in t.go ? [t.go.href] : [])) ?? []),
    tour.contact?.mapUrl,
    tour.contact?.instagram,
  ].filter((h): h is string => Boolean(h) && /^https?:/.test(h!) && !isPlaceHref(h!));
  const popups = [...new Set(hrefs)].filter((h) => (L.byUrl?.[h] ?? L.default) === "popup");
  const blocked = (await Promise.all(popups.map(async (h) => ((await canEmbed(h)) ? null : h)))).filter((h): h is string => h != null);
  if (!blocked.length) return tour;
  return { ...tour, linkOpen: { ...L, byUrl: { ...L.byUrl, ...Object.fromEntries(blocked.map((h) => [h, "tab" as const])) } } };
}
