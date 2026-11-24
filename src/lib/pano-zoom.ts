import "server-only";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { safeFetch } from "@/lib/safe-fetch";
import { PANO_HFOV } from "@/app/arpo/tour-lab/tours/places";
import type { TourConfig } from "@/app/arpo/tour-lab/tours/types";

/*
 * 360° photos sharp on every screen: a 360° photo shown zoomed in further
 * than its pixels allow looks blurred (a 4000 px photo on a computer at the
 * normal 110°). Measured here (its width), and the photo's zoom on computer
 * and phone set so a screen pixel always has a picture pixel - zoomed out as
 * far as needed - but not so far the edges bend (0.75 at most) - and never
 * further in than the normal. Done by nextviewAI every
 * time it changes a tour; a zoom set by hand is never changed.
 */

/** The screens it's made sharp for: a computer 1600 px across, a phone 390 px at 2× pixels. */
const SCREEN = { desktop: 1600, mobile: 780 };
const known = new Map<string, number | null>();

/** A photo's width, when it's a 360° one (twice as wide as high) - else null. Only the start of the file is read. */
async function panoWidth(url: string): Promise<number | null> {
  if (known.has(url)) return known.get(url)!;
  let head: Buffer | null = null;
  const db = /^\/api\/tour-files\/([\w-]+)$/.exec(url);
  if (db) {
    const row = await prisma.tourFile.findUnique({ where: { id: db[1] }, select: { data: true, url: true, contentType: true } });
    if (row?.contentType && !row.contentType.startsWith("image/")) return null;
    if (row?.data) head = Buffer.from(row.data);
    else if (row?.url) url = row.url;
  }
  if (!head) {
    if (!/^https:\/\//.test(url)) return null;
    const res = await safeFetch(url, { headers: { Range: "bytes=0-262143" }, signal: AbortSignal.timeout(8000) }).catch(() => null);
    if (!res?.ok) return null;
    head = Buffer.from(await res.arrayBuffer());
  }
  const meta = await sharp(head, { failOn: "none" }).metadata().catch(() => null);
  const w = meta?.width && meta.height && Math.abs(meta.width / meta.height - 2) < 0.05 ? meta.width : null;
  known.set(url, w);
  return w;
}

/** The zoom for a 360° photo this wide (1 = the normal view; under 1 is further out). */
export function panoZoom(width: number, device: "desktop" | "mobile"): number {
  const sharpAt = (360 * SCREEN[device]) / width;
  // Never further out than 0.75 (on a computer ~145° - further out the edges bend like a fisheye), never further in than the normal.
  return Math.round(Math.max(0.75, Math.min(1, PANO_HFOV[device] / sharpAt)) * 100) / 100;
}

/** Every picture address in the setup (photos, cards, stops, the 360° map). */
function pictures(c: TourConfig): string[] {
  const out = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === "string") {
      if (/^(\/api\/tour-files\/[\w-]+|https:\/\/[^\s"]+\.(jpe?g|png|webp)(\?[^\s"]*)?)$/i.test(v)) out.add(v);
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk({ ...c, imageView: undefined, panoCopies: undefined });
  return [...out];
}

/** The setup with every 360° photo's zoom set for computer and phone (only where none is set yet). At most 12 photos measured a time. */
export async function withPanoZoom(c: TourConfig): Promise<TourConfig> {
  const todo = pictures(c).filter((u) => c.imageView?.[u]?.desktop === undefined && c.imageView?.[u]?.mobile === undefined).slice(0, 12);
  if (!todo.length) return c;
  const widths = await Promise.all(todo.map((u) => panoWidth(u).catch(() => null)));
  let view = c.imageView;
  todo.forEach((u, i) => {
    const w = widths[i];
    if (!w) return;
    const desktop = panoZoom(w, "desktop");
    const mobile = panoZoom(w, "mobile");
    if (desktop === 1 && mobile === 1) return;
    view = { ...view, [u]: { ...view?.[u], ...(desktop !== 1 ? { desktop } : {}), ...(mobile !== 1 ? { mobile } : {}) } };
  });
  let out: TourConfig = view === c.imageView ? c : { ...c, imageView: view };
  // A 360° map (the drone photo uploaded as one picture): its start view zoomed out the same way, where none is set.
  const M = out.map;
  if (M?.panorama && M.image && (!M.start || !M.startMobile)) {
    const w = await panoWidth(M.image).catch(() => null);
    if (w) {
      const at = (s: { x: number; y: number; zoom: number } | undefined, device: "desktop" | "mobile") => s ?? { x: 50, y: 55, zoom: panoZoom(w, device) };
      out = { ...out, map: { ...M, start: at(M.start, "desktop"), startMobile: at(M.startMobile, "mobile") } };
    }
  }
  return out;
}
