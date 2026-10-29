import "server-only";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { storeTourFile } from "@/lib/tour-files";
import { imageOfHref } from "@/app/arpo/tour-lab/tours/places";
import type { PanoCopies, TourConfig } from "@/app/arpo/tour-lab/tours/types";

/*
 * 360° photos are uploaded as they come from the camera (often 12000 px wide,
 * 10-20 MB) - slow to fetch for every stop, and more than a screen can show.
 * So each one gets copies, kept as files of the tour and named in
 * `panoCopies`: 4096 px (what a phone shows - and what a computer shows at
 * once, while the sharper one comes) and 8192 px (computers). A copy that
 * would be no smaller is the photo itself. Saving a tour puts in the copies
 * made before at once; new ones are made after the save has answered.
 */

const SIZES = { phone: 4096, computer: 8192 } as const;
type Size = keyof typeof SIZES;
const SOURCE = (size: Size, url: string) => `pano-${SIZES[size]}:${url}`;

/**
 * The tour's big photos: the points' 360° photos, the drone scene's / 360°
 * map's, and the pictures the menu, tiles and "Vis mig rundt" open (a drone
 * photo shown full screen gets the same copies, so it opens at once).
 */
export function tourPanoramas(c: TourConfig): string[] {
  const hrefs = [
    ...c.menu.flatMap((m) => ("items" in m ? m.items.map(([, h]) => h) : [m.href])),
    ...(c.bento?.tiles.map((t) => t.href) ?? []),
    ...(c.guide?.stops.map((s) => ("href" in s ? s.href : "")) ?? []),
  ];
  const pictures = hrefs.map((h) => (h ? imageOfHref(h) : null));
  const urls = [...c.points.map((p) => p.panorama), c.drone?.panorama, c.map?.panorama ? c.map.image : undefined, ...pictures];
  return [...new Set(urls.filter((u): u is string => Boolean(u)))];
}

/** Only our own files: Vercel Blob, or a file kept in the database. */
async function bytesOf(url: string): Promise<Buffer | null> {
  const db = /^\/api\/tour-files\/([\w-]+)$/.exec(url);
  if (db) {
    const row = await prisma.tourFile.findUnique({ where: { id: db[1] }, select: { data: true } });
    return row?.data ? Buffer.from(row.data) : null;
  }
  if (!/^https:\/\/[\w.-]+\.public\.blob\.vercel-storage\.com\//.test(url)) return null;
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
}

/** The copies made before, by photo. */
async function known(slug: string, urls: string[]): Promise<Record<string, PanoCopies>> {
  const sizes = Object.keys(SIZES) as Size[];
  const rows = await prisma.tourFile.findMany({
    where: { tourSlug: slug, sourceUrl: { in: urls.flatMap((u) => sizes.map((s) => SOURCE(s, u))) } },
    select: { id: true, url: true, sourceUrl: true },
  });
  const found: Record<string, Partial<PanoCopies>> = {};
  for (const r of rows) {
    const m = /^pano-(\d+):(.*)$/.exec(r.sourceUrl!);
    const size = sizes.find((s) => String(SIZES[s]) === m?.[1]);
    if (!m || !size) continue;
    (found[m[2]] ??= {})[size] = r.url ?? `/api/tour-files/${r.id}`;
  }
  // A size with no copy is one the photo isn't bigger than: the photo itself (copies are made smallest first).
  return Object.fromEntries(
    Object.entries(found)
      .filter(([, c]) => c.phone)
      .map(([u, c]) => [u, { phone: c.phone!, computer: c.computer ?? u }]),
  );
}

/** The setup with every copy that already exists named (quick: no picture is touched). */
export async function withPanoCopies(slug: string, c: TourConfig): Promise<TourConfig> {
  const urls = tourPanoramas(c);
  const have = { ...c.panoCopies };
  const found = await known(slug, urls.filter((u) => !have[u]));
  const panoCopies = Object.fromEntries(urls.flatMap((u) => (have[u] || found[u] ? [[u, have[u] ?? found[u]]] : [])));
  return { ...c, panoCopies: Object.keys(panoCopies).length ? panoCopies : undefined };
}

/** Makes the missing copies (after a save) and puts them in the tour's setup. Returns how many photos got copies. */
export async function makePanoCopies(slug: string): Promise<number> {
  const tour = await prisma.tour.findUnique({ where: { slug }, select: { config: true } });
  if (!tour) return 0;
  const c = tour.config as unknown as TourConfig;
  const missing = tourPanoramas(c).filter((u) => !c.panoCopies?.[u]);
  const made: Record<string, PanoCopies> = {};
  for (const url of missing) {
    try {
      const bytes = await bytesOf(url);
      if (!bytes) continue;
      const { width, height } = await sharp(bytes, { limitInputPixels: 400_000_000 }).metadata();
      if (!width || !height) continue;
      const name = url.split("/").pop()?.replace(/\.[a-z0-9]+$/i, "") || "360";
      const copies = {} as PanoCopies;
      for (const size of Object.keys(SIZES) as Size[]) {
        const w = SIZES[size];
        if (width <= w) {
          copies[size] = url;
          continue;
        }
        const out = await sharp(bytes, { limitInputPixels: 400_000_000 })
          .resize(w, Math.round((w * height) / width))
          .jpeg({ quality: 82, mozjpeg: true })
          .toBuffer();
        copies[size] = await storeTourFile(slug, `${name}-${w}.jpg`, "image/jpeg", out, SOURCE(size, url));
      }
      made[url] = copies;
    } catch (err) {
      console.error(`[pano-copies] ${slug}: ${url}`, err);
    }
  }
  if (!Object.keys(made).length) return 0;
  // Read again: the setup may have been saved meanwhile - only the copies are added.
  const now = await prisma.tour.findUnique({ where: { slug }, select: { config: true } });
  if (!now) return 0;
  const cfg = now.config as unknown as TourConfig;
  const used = new Set(tourPanoramas(cfg));
  const panoCopies = { ...cfg.panoCopies, ...Object.fromEntries(Object.entries(made).filter(([u]) => used.has(u))) };
  await prisma.tour.update({ where: { slug }, data: { config: { ...cfg, panoCopies } as object } });
  return Object.keys(made).length;
}
