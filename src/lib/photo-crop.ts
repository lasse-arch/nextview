import "server-only";
import sharp from "sharp";
import { bytesOf } from "@/lib/logo-fix";
import { storeTourFile } from "@/lib/tour-files";

/*
 * A person's photo cut to the part chosen in the editor ("Vælg udsnit"): the
 * rectangle (fractions of the original's width and height) cut out on the
 * server, made light, and kept with the tour's files - the original is left
 * as it is, so the cut can be chosen again later.
 */

export type PhotoCrop = { x: number; y: number; w: number; h: number };

const ok = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;

export function validCrop(c: PhotoCrop | null | undefined): c is PhotoCrop {
  return Boolean(c && ok(c.x) && ok(c.y) && ok(c.w) && ok(c.h) && c.w >= 0.05 && c.h >= 0.05 && c.x + c.w <= 1.0001 && c.y + c.h <= 1.0001);
}

export async function cropPhoto(slug: string, url: string, crop: PhotoCrop): Promise<string> {
  if (!validCrop(crop)) throw new Error("Udsnittet er ugyldigt.");
  const bytes = await bytesOf(url).catch(() => null);
  if (!bytes) throw new Error("Billedet kunne ikke hentes.");
  const img = sharp(bytes, { limitInputPixels: 80_000_000 }).rotate();
  const meta = await img.metadata();
  // .rotate() honours EXIF orientation - a phone photo's width and height may be swapped.
  const turned = (meta.orientation ?? 1) >= 5;
  const W = (turned ? meta.height : meta.width) ?? 0;
  const H = (turned ? meta.width : meta.height) ?? 0;
  if (!W || !H) throw new Error("Billedet kunne ikke læses.");
  const left = Math.min(W - 1, Math.round(crop.x * W));
  const top = Math.min(H - 1, Math.round(crop.y * H));
  const width = Math.max(1, Math.min(W - left, Math.round(crop.w * W)));
  const height = Math.max(1, Math.min(H - top, Math.round(crop.h * H)));
  const out = await sharp(await img.toBuffer())
    .extract({ left, top, width, height })
    .resize({ width: 1200, height: 1500, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer();
  return storeTourFile(slug, "foto-udsnit", "image/jpeg", out);
}
