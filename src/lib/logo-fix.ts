import "server-only";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { readLimited, safeFetch } from "@/lib/safe-fetch";
import { storeTourFile } from "@/lib/tour-files";
import type { TourConfig } from "@/app/arpo/tour-lab/tours/types";
import { placeLogo } from "@/app/arpo/tour-lab/tours/logo-place";

/*
 * A tour's logo, measured instead of guessed (nextviewAI picks logoOnLight from
 * the website's words, and was wrong for a white logo): its visible pixels'
 * brightness decides whether it's a dark logo (a light card behind it) or a
 * light one (the main colour behind it) - and an empty, transparent edge
 * around it (which pushes it off centre in its tile) is cut away, the trimmed
 * copy kept with the tour's files. A logo on its own solid background is left
 * as it is. Nothing happens when the logo can't be read.
 */

async function bytesOf(url: string): Promise<Buffer | null> {
  const db = /^\/api\/tour-files\/([\w-]+)$/.exec(url);
  if (db) {
    const row = await prisma.tourFile.findUnique({ where: { id: db[1] }, select: { data: true } });
    return row?.data ? Buffer.from(row.data) : null;
  }
  if (!/^https:\/\//.test(url)) return null;
  const res = await safeFetch(url, { signal: AbortSignal.timeout(12_000) });
  if (!res.ok) return null;
  return readLimited(res, 8_000_000);
}

export type { LogoFix } from "@/app/arpo/tour-lab/tours/logo-place";
import type { LogoFix } from "@/app/arpo/tour-lab/tours/logo-place";


/** Measures (and, if worth it, trims) the logo at `url` - see the top of the file. */
export async function measureLogo(slug: string, url: string): Promise<LogoFix> {
  const bytes = await bytesOf(url).catch(() => null);
  if (!bytes) return { tone: null, trimmed: null };
  const full = await sharp(bytes, { density: svg0(url, bytes) ? 144 : undefined }).metadata().catch(() => null);
  const fullAspect = full?.width && full.height ? full.width / full.height : null;
  const svg = /\.svg(\?|$)/i.test(url) || bytes.subarray(0, 200).toString("utf8").includes("<svg");
  const img = sharp(bytes, { density: svg ? 144 : undefined }).ensureAlpha();
  const { data, info } = await img.clone().resize({ width: 96, height: 96, fit: "inside" }).raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  let n = 0;
  let corners = 0;
  let cornerAlpha = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] / 255;
    const p = i / 4;
    const x = p % info.width;
    const y = Math.floor(p / info.width);
    if ((x < 3 || x > info.width - 4) && (y < 3 || y > info.height - 4)) {
      corners++;
      cornerAlpha += a;
    }
    if (a > 0.5) {
      sum += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
      n++;
    }
  }
  // A logo on its own background (no transparency) carries its own background - neither measured nor trimmed.
  if (!n) return { tone: null, trimmed: null, aspect: fullAspect };
  if (corners && cornerAlpha / corners > 0.9) return { tone: null, trimmed: null, aspect: fullAspect, ownBg: true };
  const tone = sum / n < 0.55 ? "dark" : "light";

  // An empty transparent edge of more than ~6% on a side: cut away (never an svg - it stays sharp as it is).
  let trimmed: string | null = null;
  let aspect = fullAspect;
  if (!svg) {
    const meta = await sharp(bytes).metadata();
    const out = await sharp(bytes).trim({ threshold: 1 }).png().toBuffer({ resolveWithObject: true }).catch(() => null);
    if (out?.info.width && out.info.height) aspect = out.info.width / out.info.height;
    if (out && meta.width && meta.height && (out.info.width < meta.width * 0.94 || out.info.height < meta.height * 0.94)) {
      // A little air stays around it.
      const pad = Math.round(Math.max(out.info.width, out.info.height) * 0.02);
      const extended = await sharp(out.data).extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
      // A logo is shown at most a few hundred px wide - a huge file (thousands of px) is made light for the tour.
      const padded = await sharp(extended).resize({ width: 1200, height: 600, fit: "inside", withoutEnlargement: true }).png().toBuffer();
      trimmed = await storeTourFile(slug, "logo-beskaaret", "image/png", padded).catch(() => null);
    }
  }
  return { tone, trimmed, aspect };
}

const svg0 = (url: string, bytes: Buffer) => /\.svg(\?|$)/i.test(url) || bytes.subarray(0, 200).toString("utf8").includes("<svg");

/**
 * The setup with its logo put right: the trimmed copy in its place, and the
 * background that suits it - a dark logo on a light card, a light one on the
 * main colour (a "light" background chosen for a light logo is taken off).
 */
export async function withMeasuredLogo(slug: string, c: TourConfig): Promise<{ config: TourConfig; note: string | null }> {
  if (!c.logo) return { config: c, note: null };
  const fix = await measureLogo(slug, c.logo).catch(() => ({ tone: null, trimmed: null }) as LogoFix);
  if (!fix.tone && !fix.trimmed && !fix.aspect) return { config: c, note: null };
  const next: TourConfig = placeLogo(c, fix);
  const said: string[] = [];
  if (fix.trimmed) {
    next.logo = fix.trimmed;
    said.push("den tomme kant omkring logoet er skåret væk");
  }
  if (fix.tone) {
    next.logoOnLight = fix.tone === "dark" ? true : undefined;
    if (fix.tone === "light" && next.logoBg === "light") next.logoBg = undefined;
    if (fix.tone === "light" && next.logoBgTiles === "light") next.logoBgTiles = undefined;
    said.push(fix.tone === "dark" ? "logoet er mørkt og står på en lys baggrund" : "logoet er lyst og står på hovedfarven");
  }
  said.push("logoet står til venstre over overskriften i en størrelse, der passer til formen");
  return { config: next, note: said.join(", ") };
}
