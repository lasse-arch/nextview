import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { launchHeadlessChromium } from "@/lib/headless-chromium";
import { openPublicPage } from "@/lib/site-placement";

/*
 * Does the tour have room to breathe on the customer's page? The page (one from "Her er touren vist" - an address
 * visitors' browsers reported, so outside data) is opened in the browser that only reaches public websites
 * (lib/site-placement.ts), the tour's frame found, and the free space measured straight above and below it, at
 * the middle of the frame: the nearest thing that shows something (not a wrapper) within 48 px. Under 16 px below
 * (the usual case: the page's footer right under the tour) is too tight - it looks glued on. Above is measured too, but
 * not warned about: a heading just over the tour is normal, and carousels there give false answers. The answer is kept a week (IntegrationSetting), and refreshed after a page is shown.
 */

export type Spacing = { url: string; above: number | null; below: number | null; tight: boolean; checkedAt: string } | { url: string; error: true; checkedAt: string };
const MIN = 16;
const keyOf = (slug: string, url: string) => `EMBED_SPACING:${slug}:${createHash("sha256").update(url).digest("hex").slice(0, 24)}`;
const WEEK = 7 * 86_400_000;

export async function cachedSpacing(slug: string, urls: string[]): Promise<Map<string, Spacing>> {
  const rows = await prisma.integrationSetting.findMany({ where: { key: { in: urls.map((u) => keyOf(slug, u)) } } });
  const out = new Map<string, Spacing>();
  for (const r of rows) {
    try {
      const s = JSON.parse(r.value ?? "null") as Spacing | null;
      if (s?.url) out.set(s.url, s);
    } catch {}
  }
  return out;
}

const MEASURE = (host: string, slug: string) => `(() => {
  const frames = [...document.querySelectorAll('iframe')].filter((f) => { try { const u = new URL(f.src, location.href); return (u.host === ${JSON.stringify(host)} || u.host.endsWith('nextview360.dk')) && u.pathname.includes(${JSON.stringify(slug)}); } catch { return false; } });
  const f = frames.find((x) => x.getBoundingClientRect().height > 100);
  if (!f) return null;
  // The tour's box: the frame and the wrappers that are just as big (our code puts it in one).
  let box = f;
  while (box.parentElement && box.parentElement !== document.body) { const a = box.getBoundingClientRect(), b = box.parentElement.getBoundingClientRect(); if (Math.abs(a.height - b.height) > 4 || Math.abs(a.width - b.width) > 4) break; box = box.parentElement; }
  // What can be seen around it: a block with a colour of its own (a footer, a coloured band) or a picture or button -
  // words just above or below are normal and left out, so the tip is only given where the tour really looks glued on - not wrappers that only hold others, and nothing that holds or is inside the tour.
  const q = box.getBoundingClientRect();
  const cx = q.left + q.width / 2;
  const shows = (el) => {
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false;
    if (/^(IMG|VIDEO|SVG|svg|CANVAS|BUTTON|INPUT|TEXTAREA|SELECT|IFRAME|HR)$/.test(el.tagName)) return true;
    if (cs.backgroundColor && !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor)) return true;
    return false;
  };
  // Really seen there: brought into view, the point just inside its edge (next to the tour) shows it - not something
  // hidden behind, clipped away or outside a carousel.
  const seen = (el, y) => {
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(Math.min(Math.max(cx, r.left + 2), r.right - 2), y(r));
    return !!hit && (hit === el || el.contains(hit));
  };
  const near = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.contains(box) || box.contains(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 2 || r.left > cx || r.right < cx) continue;
    if (r.top >= q.bottom - 1 && r.top - q.bottom <= 48 && shows(el)) near.push({ el, side: 'below', gap: Math.max(0, Math.round(r.top - q.bottom)) });
    if (r.bottom <= q.top + 1 && q.top - r.bottom <= 48 && shows(el)) near.push({ el, side: 'above', gap: Math.max(0, Math.round(q.top - r.bottom)) });
  }
  let above = null, below = null;
  for (const n of near.slice(0, 40)) {
    if (!seen(n.el, (r) => (n.side === 'below' ? r.top + 2 : r.bottom - 2))) continue;
    if (n.side === 'below') below = Math.min(below ?? 99, n.gap);
    else above = Math.min(above ?? 99, n.gap);
  }
  const seek = (dir) => (dir > 0 ? below : above);
  return { above: seek(-1), below: seek(1) };
})()`;

/** Opens the page and measures - the caller decides when (it takes a few seconds). */
export async function measureSpacing(slug: string, url: string): Promise<Spacing> {
  const checkedAt = new Date().toISOString();
  let result: Spacing = { url, error: true, checkedAt };
  if (/^https:\/\//.test(url)) {
    const browser = await launchHeadlessChromium();
    try {
      const page = await openPublicPage(browser, url, false);
      const m = (await page.evaluate(MEASURE("tour.nextview360.dk", slug))) as { above: number | null; below: number | null } | null;
      if (m) result = { url, above: m.above, below: m.below, tight: m.below != null && m.below < MIN, checkedAt };
    } catch {
      // A page that can't be opened (gone, blocked, not public) is just left without an answer.
    } finally {
      await browser.close().catch(() => {});
    }
  }
  await prisma.integrationSetting.upsert({ where: { key: keyOf(slug, url) }, create: { key: keyOf(slug, url), value: JSON.stringify(result) }, update: { value: JSON.stringify(result) } });
  return result;
}

/** After a page is shown: the pages not measured in a week, at most two at a time (each opens a browser). */
export async function refreshSpacing(slug: string, urls: string[]): Promise<void> {
  const have = await cachedSpacing(slug, urls);
  const due = urls.filter((u) => /^https:\/\//.test(u) && (!have.get(u) || Date.now() - Date.parse(have.get(u)!.checkedAt) > WEEK)).slice(0, 2);
  for (const u of due) await measureSpacing(slug, u).catch(() => null);
}
