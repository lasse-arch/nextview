import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { dealName, needsDeliveryLink } from "@/lib/labels";
import { readLimited, safeFetch } from "@/lib/safe-fetch";

/*
 * The customer band on the website's front page ("Steder, der allerede viser
 * sig frem"): the logo of every customer whose tour is out there - from their
 * published tour in Arpo, or read from their tour on explore (kept in
 * SiteLogo, checked again once a month). A new customer appears by itself
 * once their tour is online. Only the logo already shown in their public tour
 * leaves here - and the name, as the logo's alt text.
 */

export type LogoTone = "dark" | "light" | "box" | "boxdark";
export type SiteCustomer = { name: string; logo: string; tone: LogoTone; key: string };

/** Taken off the website on the owner's request - never shown in the band. */
const HIDDEN = ["jalsa", "is kompagniet"];
const EXPLORE = "explore.nextview360.dk";
const MONTH = 30 * 86_400_000;

/** A logo we show: one of our own files ("/…") or an https address - nothing else (no data:, javascript: …). */
function safeLogo(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 500) return null;
  if (/^\/[^/\\]/.test(v) || /^https:\/\/[^\s"'<>]+$/i.test(v)) return v;
  return null;
}

/** The explore tour page among a deal's links (https://explore.nextview360.dk/…), if any. */
function exploreUrl(urls: (string | null)[]): string | null {
  for (const raw of urls) {
    if (!raw) continue;
    try {
      const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
      if (u.hostname === EXPLORE) return `https://${EXPLORE}${u.pathname}`;
    } catch {}
  }
  return null;
}

export async function siteCustomers(): Promise<SiteCustomer[]> {
  const [tours, deals] = await Promise.all([
    prisma.tour.findMany({
      where: { OR: [{ published: true }, { liveVersion: { not: null } }] },
      select: { name: true, config: true, dealId: true, deal: { select: { companyName: true, displayName: true, churnedAt: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.deal.findMany({
      where: { stage: "LIVE", churnedAt: null },
      select: { id: true, companyName: true, displayName: true, siteLogo: true, items: { where: { url: { not: null } }, select: { productType: true, url: true } } },
      orderBy: { liveAt: "asc" },
    }),
  ]);
  const out: SiteCustomer[] = [];
  const seen = new Set<string>();
  const add = (c: SiteCustomer) => {
    const name = c.name.trim().toLowerCase();
    if (!name || HIDDEN.some((h) => name.includes(h)) || seen.has(c.key)) return;
    seen.add(c.key);
    out.push(c);
  };
  const withTour = new Set<string>();
  for (const t of tours) {
    // A customer who has left isn't shown, even if an old tour of theirs is still up.
    if (t.deal?.churnedAt) continue;
    if (t.dealId) withTour.add(t.dealId);
    const cfg = (t.config ?? {}) as { brand?: unknown; logo?: unknown; logoOnLight?: unknown };
    const logo = safeLogo(cfg.logo);
    if (!logo) continue;
    const name = t.deal ? dealName(t.deal) : typeof cfg.brand === "string" && cfg.brand.trim() ? cfg.brand : t.name;
    add({ name: name.slice(0, 80), logo, tone: cfg.logoOnLight === true ? "dark" : "light", key: logo });
  }
  for (const d of deals) {
    if (withTour.has(d.id)) continue;
    const l = d.siteLogo;
    if (!l?.url || !l.tone) continue;
    add({ name: dealName(d).slice(0, 80), logo: l.url, tone: l.tone as LogoTone, key: l.hash ?? l.url });
  }
  return out;
}

/**
 * Reads the logos of live customers on explore that we haven't got (or not
 * checked for a month) - a few at a time, after the page is sent.
 */
export async function refreshSiteLogos(limit = 6): Promise<void> {
  const deals = await prisma.deal.findMany({
    where: { stage: "LIVE", churnedAt: null, tours: { none: { OR: [{ published: true }, { liveVersion: { not: null } }] } } },
    select: { id: true, websiteUrl: true, siteLogo: { select: { checkedAt: true, source: true } }, items: { where: { url: { not: null } }, select: { productType: true, url: true } } },
  });
  const due = deals
    .map((d) => {
      const tour = exploreUrl(d.items.filter((i) => needsDeliveryLink(i.productType) && !/hjemmeside/i.test(i.productType)).map((i) => i.url));
      const site = tour ? webUrl(d.websiteUrl) : null;
      return { d, tour, site, source: [tour, site].filter(Boolean).join(" ") };
    })
    .filter(({ d, tour, source }) => tour && (!d.siteLogo || d.siteLogo.source !== source || Date.now() - d.siteLogo.checkedAt.getTime() > MONTH))
    .slice(0, limit);
  for (const { d, tour, site, source } of due) {
    // The logo in their tour - else the one on their own website.
    const found = (await readExploreLogo(tour!).catch(() => null)) ?? (site ? await readWebsiteLogo(site).catch(() => null) : null);
    const data = { source, url: found?.url ?? null, tone: found?.tone ?? null, hash: found?.hash ?? null, checkedAt: new Date() };
    await prisma.siteLogo.upsert({ where: { dealId: d.id }, create: { dealId: d.id, ...data }, update: data });
  }
}

/** The logo in an explore tour's corner (its "logo-box"), and what kind of logo it is. */
async function readExploreLogo(page: string): Promise<{ url: string; tone: LogoTone; hash: string } | null> {
  const res = await safeFetch(page, { signal: AbortSignal.timeout(10_000), maxRedirects: 2 });
  if (!res.ok) return null;
  const html = (await readLimited(res, 1_500_000)).toString("utf8");
  const m = html.match(/class="logo-box[^"]*"[^>]*>\s*<a\b[^>]*>\s*<img\s+src="(https:\/\/[^"\s<>]+)"/i);
  const url = m ? safeLogo(m[1].replace(/&amp;/g, "&")) : null;
  return url ? checkLogo(url) : null;
}

/** A customer's website address, as https (or null). */
function webUrl(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
    u.protocol = "https:";
    return u.href;
  } catch {
    return null;
  }
}

/**
 * The logo on a customer's own front page: the first picture that says it is
 * one ("logo" in its address, class, id or alt text). The page is someone
 * else's, so only that one address is taken from it - and the picture must
 * look like a logo (checkLogo).
 */
async function readWebsiteLogo(site: string): Promise<{ url: string; tone: LogoTone; hash: string } | null> {
  const res = await safeFetch(site, { signal: AbortSignal.timeout(10_000), maxRedirects: 3 });
  if (!res.ok) return null;
  const html = (await readLimited(res, 1_500_000)).toString("utf8").replace(/\s+/g, " ");
  for (const tag of html.match(/<img\b[^>]{0,2000}>/gi) ?? []) {
    if (!/logo/i.test(tag) || /nextview/i.test(tag)) continue;
    const src = tag.match(/\s(?:data-src|src)="([^"]+)"/i)?.[1]?.replace(/&amp;/g, "&");
    if (!src || src.startsWith("data:")) continue;
    let url: string;
    try {
      url = new URL(src, res.url || site).href;
    } catch {
      continue;
    }
    if (!url.startsWith("https://")) continue;
    const found = await checkLogo(url).catch(() => null);
    if (found) return found;
  }
  return null;
}

/** Fetches a logo and checks it is a picture shaped like one (wider than tall, not tiny). */
async function checkLogo(url: string): Promise<{ url: string; tone: LogoTone; hash: string } | null> {
  if (!safeLogo(url)) return null;
  const img = await safeFetch(url, { signal: AbortSignal.timeout(10_000), maxRedirects: 2 });
  if (!img.ok || !/^image\//i.test(img.headers.get("content-type") ?? "")) return null;
  const bytes = await readLimited(img, 3_000_000);
  const meta = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata();
  if (!meta.width || !meta.height || meta.width < 40 || meta.width / meta.height < 0.6 || meta.width / meta.height > 9) return null;
  return { url, ...(await logoKind(bytes)) };
}

/** Light or dark, see-through or on its own background - so it can be shown evenly on white - and a fingerprint. */
async function logoKind(bytes: Buffer): Promise<{ tone: LogoTone; hash: string }> {
  const size = 48;
  const { data } = await sharp(bytes, { limitInputPixels: 40_000_000 }).resize(size, size, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const lum = (i: number) => (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
  let edgeOpaque = 0;
  let edges = 0;
  let edgeLum = 0;
  let inkLum = 0;
  let ink = 0;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const a = data[i + 3];
      if (x === 0 || y === 0 || x === size - 1 || y === size - 1) {
        edges++;
        if (a > 200) {
          edgeOpaque++;
          edgeLum += lum(i);
        }
      }
      if (a > 128) {
        ink++;
        inkLum += lum(i);
      }
    }
  const hash = createHash("sha1").update(data).digest("hex").slice(0, 20);
  if (edgeOpaque / edges > 0.8) return { tone: edgeLum / edgeOpaque > 0.82 ? "box" : "boxdark", hash };
  return { tone: ink && inkLum / ink > 0.72 ? "light" : "dark", hash };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The band's inside, as HTML: the list twice over, so it can run without a seam. */
export function customerBandHtml(list: SiteCustomer[]): string {
  if (!list.length) return "";
  const one = list.map((c) => `<li><img src="${esc(c.logo)}" alt="${esc(c.name)}" loading="lazy" decoding="async" class="t-${c.tone}"></li>`).join("");
  const dur = Math.max(30, list.length * 4);
  return `<ul class="cb-track" style="--cb-dur:${dur}s">${one}${one.replace(/<li>/g, '<li aria-hidden="true">')}</ul>`;
}
