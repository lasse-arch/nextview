import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { fetchModelInfo } from "@/lib/matterport-graph";
import type { TourConfig } from "@/app/arpo/tour-lab/tours/types";

/*
 * "Jeres tour på en MacBook": the picture in the welcome mail - the tour's
 * front page (its cover picture, logo, title and button) on a laptop's
 * screen. Made when the mail is sent and put in the mail itself (no public
 * address to fetch it from). Drawn from the setup, not a screenshot: the
 * same picture, words and colour as the front page.
 */

const W = 1040;
const H = 660;

/** A picture of ours, as bytes: a tour file in the database, a file under public/, Vercel Blob or Matterport. */
async function bytesOf(url: string): Promise<Buffer | null> {
  const db = /^\/api\/tour-files\/([\w-]+)$/.exec(url);
  if (db) {
    const row = await prisma.tourFile.findUnique({ where: { id: db[1] }, select: { data: true } });
    return row?.data ? Buffer.from(row.data) : null;
  }
  if (url.startsWith("/")) {
    const pub = path.join(process.cwd(), "public");
    const file = path.normalize(path.join(pub, decodeURIComponent(url.split("?")[0])));
    if (!file.startsWith(pub + path.sep)) return null;
    return readFile(file).catch(() => null);
  }
  if (!/^https:\/\/([\w-]+\.public\.blob\.vercel-storage\.com|([a-z0-9-]+\.)*matterport\.com)\//i.test(url)) return null;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000), cache: "no-store" }).catch(() => null);
  if (!res?.ok) return null;
  const data = Buffer.from(await res.arrayBuffer());
  return data.length > 40_000_000 ? null : data;
}

/** As a data address the drawing can use (it reads PNG and JPEG). */
async function dataUrl(url: string | null | undefined, width: number, kind: "jpeg" | "png"): Promise<string | null> {
  if (!url) return null;
  const bytes = await bytesOf(url).catch(() => null);
  if (!bytes) return null;
  const img = sharp(bytes, { limitInputPixels: 400_000_000 }).resize({ width, withoutEnlargement: true });
  const out = await (kind === "jpeg" ? img.jpeg({ quality: 80 }) : img.png()).toBuffer().catch(() => null);
  return out ? `data:image/${kind};base64,${out.toString("base64")}` : null;
}

/** The front page's words and picture, from the setup. */
async function frontOf(c: TourConfig) {
  const hero = c.modelId ? (await fetchModelInfo(c.modelId))?.image : null;
  const picture = c.cover?.image ?? c.map?.image ?? hero ?? c.drone?.panorama ?? null;
  return {
    picture,
    kicker: c.cover?.kicker ?? c.welcome?.kicker ?? c.brand,
    title: c.cover?.title ?? c.drone?.intro.title ?? c.welcome?.title ?? c.title,
    button: c.cover?.enter ?? "Se touren",
  };
}

/** The picture (JPEG), or null when there's no picture to show (then the mail has a button instead). */
export async function tourMockup(source: { config: TourConfig } | { modelId: string }): Promise<Buffer | null> {
  const c = "config" in source ? source.config : null;
  const front = "config" in source ? await frontOf(source.config) : { picture: (await fetchModelInfo(source.modelId))?.image ?? null, kicker: "", title: "", button: "" };
  const screen = await dataUrl(front.picture, 1000, "jpeg");
  if (!screen) return null;
  const logo = c ? await dataUrl(c.logo, 360, "png") : null;
  const accent = c?.colors?.accent ?? "#0071e3";
  const sw = 860;
  const sh = Math.round((sw * 10) / 16);
  const res = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", background: "#ffffff" }}>
        {/* The lid: black bezel round the screen. */}
        <div style={{ display: "flex", padding: 16, paddingBottom: 22, borderRadius: 26, background: "#141416", border: "2px solid #3a3a3c" }}>
          <div style={{ display: "flex", position: "relative", width: sw, height: sh, borderRadius: 6, overflow: "hidden" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={screen} alt="" width={sw} height={sh} style={{ position: "absolute", top: 0, left: 0, width: sw, height: sh, objectFit: "cover" }} />
            {front.title ? (
              <div style={{ position: "absolute", top: 0, left: 0, width: sw, height: sh, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 40, backgroundImage: "linear-gradient(90deg, rgba(0,0,0,.62) 0%, rgba(0,0,0,.28) 55%, rgba(0,0,0,0) 100%)" }}>
                <div style={{ display: "flex", height: 48 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {logo && <img src={logo} alt="" height={48} style={{ height: 48, ...(c?.logoOnLight ? { background: "#ffffff", padding: "6px 10px", borderRadius: 8 } : {}) }} />}
                </div>
                <div style={{ display: "flex", flexDirection: "column", maxWidth: 520, color: "#ffffff" }}>
                  {front.kicker && <div style={{ fontSize: 17, letterSpacing: 2, textTransform: "uppercase", opacity: 0.85, marginBottom: 10 }}>{front.kicker}</div>}
                  <div style={{ fontSize: 44, fontWeight: 700, lineHeight: 1.08 }}>{front.title}</div>
                  <div style={{ display: "flex", marginTop: 26 }}>
                    <div style={{ display: "flex", padding: "13px 26px", borderRadius: 999, background: accent, color: "#ffffff", fontSize: 19, fontWeight: 700 }}>{front.button}</div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
        {/* The base: a thin silver slab, wider than the lid, with the notch to open it. */}
        <div style={{ display: "flex", justifyContent: "center", width: sw + 150, height: 22, borderRadius: "0 0 22px 22px", backgroundImage: "linear-gradient(180deg, #e5e5ea 0%, #c7c7cc 70%, #a1a1a6 100%)" }}>
          <div style={{ width: 150, height: 9, borderRadius: "0 0 10px 10px", background: "#b0b0b5" }} />
        </div>
        <div style={{ width: sw + 90, height: 8, borderRadius: 999, background: "rgba(0,0,0,.07)", marginTop: 2 }} />
      </div>
    ),
    { width: W, height: H },
  );
  if (!res.ok) return null;
  // A photo on white: as JPEG it's a tenth of the PNG - friendlier in an inbox.
  return sharp(await sharp(Buffer.from(await res.arrayBuffer())).flatten({ background: "#ffffff" }).trim({ background: "#ffffff", threshold: 4 }).toBuffer()).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
}

/** The deal's tour for the picture: its own tour in Arpo (a published one first). */
export async function dealTourMockup(dealId: string, modelId: string | null): Promise<Buffer | null> {
  const tours = await prisma.tour.findMany({ where: { dealId }, select: { config: true, published: true }, orderBy: { createdAt: "asc" } });
  const tour = tours.find((t) => t.published) ?? tours[0];
  try {
    if (tour) return await tourMockup({ config: tour.config as unknown as TourConfig });
    if (modelId) return await tourMockup({ modelId });
  } catch (err) {
    console.error("[tour-mockup]", err);
  }
  return null;
}
