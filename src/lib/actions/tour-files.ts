"use server";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { copyToTour, DB_MAX, hostFiles, storeTourFile } from "@/lib/tour-files";
import type { TourConfig } from "@/app/arpo/tour-lab/tours/types";

async function admin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan redigere tours.");
}

/** Copies every file the setup takes from other sites to us; the editor puts the new setup in its draft. */
export async function hostTourFiles(slug: string, config: TourConfig): Promise<{ ok: true; config: TourConfig; copied: number; failed: string[] }> {
  await admin();
  return { ok: true, ...(await hostFiles(slug, config)) };
}

/** An upload from the editor (without Vercel Blob: up to 4 MB, kept in the database). */
export async function uploadTourFile(slug: string, form: FormData): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await admin();
  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Ingen fil." };
  if (file.size > DB_MAX) return { ok: false, error: "Filen er over 4 MB - store filer som video kræver Vercel Blob." };
  try {
    return { ok: true, url: await storeTourFile(slug, file.name, file.type, Buffer.from(await file.arrayBuffer())) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Records a file the editor uploaded straight to Vercel Blob. */
export async function registerTourFile(slug: string, file: { url: string; name: string; contentType: string; size: number }): Promise<void> {
  await admin();
  if (!/^https:\/\/[\w.-]+\.blob\.vercel-storage\.com\//.test(file.url)) throw new Error("Ukendt filadresse.");
  await prisma.tourFile.create({ data: { tourSlug: slug, name: file.name.slice(0, 200), contentType: file.contentType, size: file.size, url: file.url } });
}

/**
 * The customer's own favicon, fetched from their website and kept by us:
 * the biggest icon the site names (apple-touch-icon, icon sizes …), or
 * /favicon.ico when it names none.
 */
export async function fetchSiteFavicon(slug: string, site: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await admin();
  try {
    const base = new URL(/^https?:\/\//i.test(site.trim()) ? site.trim() : `https://${site.trim()}`);
    if (!/^https?:$/.test(base.protocol) || /^(localhost|\d+\.\d+\.\d+\.\d+)$|\.(local|internal)$/.test(base.hostname)) return { ok: false, error: "Skriv kundens offentlige hjemmeside." };
    const res = await fetch(base, { headers: { "User-Agent": "Mozilla/5.0 (compatible; ArpoTourBuilder/1.0)" }, signal: AbortSignal.timeout(15_000), redirect: "follow" });
    if (!res.ok) return { ok: false, error: `${base.hostname} svarede ${res.status}.` };
    const html = (await res.text()).slice(0, 1_500_000);
    const icons = [...html.matchAll(/<link\b[^>]*>/gi)]
      .map((m) => m[0])
      .filter((tag) => /\brel\s*=\s*["'][^"']*icon[^"']*["']/i.test(tag) && !/mask-icon/i.test(tag))
      .map((tag) => {
        const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
        const size = Math.max(0, ...[.../\bsizes\s*=\s*["'](\d+)x\d+/i.exec(tag)?.slice(1) ?? []].map(Number));
        // Bigger is sharper; an apple-touch-icon is a big square made for exactly this.
        const score = size || (/apple-touch-icon/i.test(tag) ? 180 : /\.svg/i.test(href ?? "") ? 512 : 32);
        return href ? { url: new URL(href.replace(/&amp;/g, "&"), res.url).toString(), score } : null;
      })
      .filter((x): x is { url: string; score: number } => Boolean(x))
      .sort((a, b) => b.score - a.score);
    const candidates = [...icons.map((i) => i.url), new URL("/favicon.ico", res.url).toString()];
    for (const url of candidates) {
      try {
        return { ok: true, url: await copyToTour(slug, url) };
      } catch {
        // try the next one
      }
    }
    return { ok: false, error: "Fandt intet ikon på hjemmesiden." };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** "Hent fra en kortside": an aerial-photo map page on lovable.app, read and copied into this tour (the editor puts it in its draft). */
export async function importMapPageAction(slug: string, url: string): Promise<{ ok: true; result: import("@/lib/lovable-map").MapImport } | { ok: false; error: string }> {
  await admin();
  if (!(await prisma.tour.findUnique({ where: { slug }, select: { slug: true } }))) return { ok: false, error: "Touren findes ikke." };
  try {
    const { importMapPage } = await import("@/lib/lovable-map");
    return { ok: true, result: await importMapPage(slug, String(url)) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
