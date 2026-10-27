import "server-only";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/db";
import type { TourConfig } from "@/app/arpo/tour-lab/tours/types";

/*
 * A tour's files (logo, photos, svg, videos) kept by us, so a tour never
 * breaks because a customer changed or removed something on their website.
 * With Vercel Blob set up (BLOB_READ_WRITE_TOKEN) every file goes there - fast,
 * and big videos too. Without it, files up to 4 MB live in the database and
 * are served by /api/tour-files/<id> (a serverless response can't be larger).
 */

export const blobReady = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);
export const DB_MAX = 4 * 1024 * 1024;
const BLOB_MAX = 200 * 1024 * 1024;

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "image/avif": "avif",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};
export const ALLOWED_TYPES = Object.keys(EXT);

/** Stores a file for a tour and returns the address the tour uses. */
export async function storeTourFile(slug: string, name: string, contentType: string, bytes: Buffer, sourceUrl?: string): Promise<string> {
  const type = contentType.split(";")[0].trim().toLowerCase();
  if (!EXT[type]) throw new Error(`${name}: filtypen ${type || "(ukendt)"} kan ikke bruges (billeder, svg, video og lyd).`);
  if (blobReady()) {
    if (bytes.length > BLOB_MAX) throw new Error(`${name} er for stor (max 200 MB).`);
    const base = name.replace(/\.[a-z0-9]+$/i, "").replace(/[^a-zA-Z0-9-]+/g, "-").slice(0, 60) || "fil";
    const blob = await put(`tours/${slug}/${base}.${EXT[type]}`, bytes, { access: "public", contentType: type, addRandomSuffix: true });
    await prisma.tourFile.create({ data: { tourSlug: slug, name, contentType: type, size: bytes.length, url: blob.url, sourceUrl } });
    return blob.url;
  }
  if (bytes.length > DB_MAX) throw new Error(`${name} er ${(bytes.length / 1048576).toFixed(1)} MB - filer over 4 MB (fx video) kræver Vercel Blob.`);
  const row = await prisma.tourFile.create({ data: { tourSlug: slug, name, contentType: type, size: bytes.length, data: new Uint8Array(bytes), sourceUrl }, select: { id: true } });
  return `/api/tour-files/${row.id}`;
}

/** A Google Drive "view" link as a direct download (we often get videos and pictures that way). */
function downloadable(url: string): string {
  const drive = /drive\.google\.com\/file\/d\/([\w-]+)/.exec(url) ?? /drive\.google\.com\/(?:open|uc)\?(?:.*&)?id=([\w-]+)/.exec(url);
  return drive ? `https://drive.usercontent.google.com/download?id=${drive[1]}&export=download&confirm=t` : url;
}

/** Copies one outside file to us (or reuses the copy made before). */
export async function copyToTour(slug: string, url: string): Promise<string> {
  const known = await prisma.tourFile.findFirst({ where: { tourSlug: slug, sourceUrl: url }, select: { id: true, url: true } });
  if (known) return known.url ?? `/api/tour-files/${known.id}`;
  const parsed = new URL(url);
  if (!/^https?:$/.test(parsed.protocol) || /^(localhost|\d+\.\d+\.\d+\.\d+)$/.test(parsed.hostname)) throw new Error(`${url}: ikke en offentlig adresse.`);
  const res = await fetch(downloadable(url), { signal: AbortSignal.timeout(60_000), headers: { "User-Agent": "Mozilla/5.0 (compatible; ArpoTourBuilder/1.0)" } });
  if (!res.ok) throw new Error(`${parsed.hostname} svarede ${res.status}.`);
  const max = blobReady() ? BLOB_MAX : DB_MAX;
  if (Number(res.headers.get("content-length") ?? 0) > max) throw new Error(`${parsed.pathname.split("/").pop()} er for stor${blobReady() ? "" : " - filer over 4 MB (fx video) kræver Vercel Blob"}.`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const name = decodeURIComponent(parsed.pathname.split("/").pop() || parsed.hostname);
  let type = res.headers.get("content-type") ?? "";
  if (!EXT[type.split(";")[0]]) type = /\.svg$/i.test(name) ? "image/svg+xml" : /\.mp3$/i.test(name) ? "audio/mpeg" : /\.m4a$/i.test(name) ? "audio/mp4" : type;
  return storeTourFile(slug, name, type, bytes, url);
}

/** Is this address someone else's - a file that could disappear? (Matterport's photo links expire too.) */
export function isOutside(src: string | undefined): src is string {
  if (!src || !/^https?:\/\//i.test(src)) return false;
  const host = new URL(src).hostname;
  return !/(^|\.)(arpo\.dk|nextview360\.dk|blob\.vercel-storage\.com|localhost)$/.test(host);
}

type Slot = { get: () => string | undefined; set: (v: string) => void };
/** Every place in a setup that holds a file. */
export function fileSlots(c: TourConfig): Slot[] {
  const slots: Slot[] = [
    { get: () => c.logo, set: (v) => (c.logo = v) },
    { get: () => c.favicon, set: (v) => (c.favicon = v) },
    { get: () => c.cover?.image, set: (v) => (c.cover!.image = v) },
    { get: () => c.cover?.imageMobile, set: (v) => (c.cover!.imageMobile = v) },
    { get: () => c.intro?.poster, set: (v) => (c.intro!.poster = v) },
    { get: () => c.map?.image, set: (v) => (c.map!.image = v) },
  ];
  c.places?.forEach((p) => slots.push({ get: () => p.image, set: (v) => (p.image = v) }));
  c.intro?.sources.forEach((s) => slots.push({ get: () => s.src, set: (v) => (s.src = v) }));
  c.info?.forEach((i) => slots.push({ get: () => i.image, set: (v) => (i.image = v) }));
  c.guide?.stops.forEach((s) => "audio" in s && slots.push({ get: () => s.audio, set: (v) => (s.audio = v) }));
  return slots;
}

/** Copies every outside file of a setup to us and points the setup at the copies. */
export async function hostFiles(slug: string, config: TourConfig): Promise<{ config: TourConfig; copied: number; failed: string[] }> {
  const next = structuredClone(config);
  let copied = 0;
  const failed: string[] = [];
  for (const slot of fileSlots(next)) {
    const src = slot.get();
    if (!isOutside(src)) continue;
    try {
      slot.set(await copyToTour(slug, src));
      copied++;
    } catch (err) {
      failed.push(err instanceof Error ? err.message : String(err));
    }
  }
  return { config: next, copied, failed };
}
