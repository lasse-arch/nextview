import "server-only";
import { prisma } from "@/lib/db";
import { fetchScanMap } from "@/lib/matterport-graph";
import { tourLooks } from "@/lib/tour-looks";
import { addDays, dayStart } from "@/lib/tour-stats";
import type { TourConfig } from "@/app/arpo/tour-lab/tours/types";

/*
 * The heatmap's data (Resultater, the customer's statistics, the report link):
 * where visitors spend their time inside the tour - seconds and visits per scan
 * point, placed on Matterport's floor plan - and what they open on the aerial
 * photo / map (the points pressed, and their 360° photos). Only the tour's own
 * measurement; nothing about who the visitors are. The floor plans' links are
 * Matterport's signed ones, fetched fresh each time.
 */

export type HeatSpot = { ss: number; floor: number; px: number; py: number; room: string | null; seconds: number; visits: number };
export type HeatPoint = { name: string; opens: number; /** On a 360° scene: where the point is. */ yaw?: number; pitch?: number; /** On a flat map: % of the picture. */ x?: number; y?: number };
export type HeatData = {
  plan: { floors: { name: string; image: string | null; aspect: number | null }[]; spots: HeatSpot[] } | null;
  aerial:
    | {
        /** A 360° scene (the drone's tiles, or one 360° photo) - shown at its start view. */
        scene?: { tiles?: { basePath: string; maxLevel: number; cubeResolution: number }; panorama?: string; start: { yaw: number; pitch: number; hfov: number } };
        /** A flat map picture. */
        map?: { image: string; w: number; h: number };
        points: HeatPoint[];
      }
    | null;
};

export async function tourHeat(slug: string, config: TourConfig, range: number | { from: string; to: string } = 60): Promise<HeatData> {
  const createdAt = typeof range === "number" ? { gte: new Date(Date.now() - range * 86_400_000) } : { gte: dayStart(range.from), lt: dayStart(addDays(range.to, 1)) };
  const [looks, scanMap, opened] = await Promise.all([
    tourLooks(slug, range).catch(() => []),
    config.modelId ? fetchScanMap(config.modelId).catch(() => null) : Promise.resolve(null),
    prisma.tourEvent.groupBy({ by: ["label"], where: { tourSlug: slug, name: { in: ["drone_point_click", "pano_open"] }, createdAt }, _count: { _all: true } }).catch(() => []),
  ]);

  // Inside: each measured scan point on its floor's plan.
  let plan: HeatData["plan"] = null;
  if (scanMap) {
    const at = new Map(scanMap.points.map((p) => [p.ss, p]));
    const spots = looks
      .map((l) => ({ l, p: at.get(l.ss) }))
      .filter((x): x is { l: (typeof looks)[number]; p: NonNullable<typeof x.p> } => x.p?.px != null && x.p.py != null)
      .map(({ l, p }) => ({ ss: l.ss, floor: p.floor, px: p.px!, py: p.py!, room: l.room, seconds: l.seconds, visits: l.visits }));
    if (spots.length) plan = { floors: scanMap.floors, spots };
  }

  // The aerial photo / map: how often each point was opened (its card, or its 360° photo).
  const opens = new Map<string, number>();
  for (const r of opened) if (r.label) opens.set(r.label, (opens.get(r.label) ?? 0) + r._count._all);
  let aerial: HeatData["aerial"] = null;
  const D = config.drone;
  const M = config.map;
  if ((D || M) && opens.size) {
    const points: HeatPoint[] = config.points
      .map((p): HeatPoint | null => {
        const n = opens.get(p.name) ?? 0;
        if (!n) return null;
        if (D) return { name: p.name, opens: n, yaw: p.yaw, pitch: p.pitch };
        const spot = M!.spots[p.id];
        if (!spot) return null;
        return M!.panorama ? { name: p.name, opens: n, yaw: (spot[0] / 100) * 360 - 180, pitch: 90 - (spot[1] / 100) * 180 } : { name: p.name, opens: n, x: spot[0], y: spot[1] };
      })
      .filter((p): p is HeatPoint => Boolean(p))
      .sort((a, b) => b.opens - a.opens);
    if (points.length)
      aerial = D
        ? { scene: { ...(D.panorama ? { panorama: D.panorama } : { tiles: { basePath: D.basePath, maxLevel: D.maxLevel, cubeResolution: D.cubeResolution } }), start: D.start }, points }
        : M!.panorama
          ? { scene: { panorama: M!.image, start: M!.start ? { yaw: (M!.start.x / 100) * 360 - 180, pitch: 90 - (M!.start.y / 100) * 180, hfov: 100 / (M!.start.zoom || 1) } : { yaw: 0, pitch: -20, hfov: 100 } }, points }
          : { map: { image: M!.image, w: M!.w, h: M!.h }, points };
  }
  return { plan, aerial };
}
