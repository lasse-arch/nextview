import "server-only";
import { cached, publicUrl } from "@/lib/site-digest";
import { placeSlug, type StartPlace } from "@/app/(app)/tour-lab/tours/places";

/*
 * Which page on the customer's website each place in the tour belongs on -
 * "Minigolf" on /minigolf/, "Fodboldgolf" on /fodboldgolf/ - so the tour's
 * code on that page starts right there. The site's pages come from its
 * sitemap and the links on its front page (cached a week).
 */

const UA = "Mozilla/5.0 (compatible; ArpoTourBuilder/1.0; +https://www.arpo.dk)";
type Page = { url: string; title: string };

async function get(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15_000), redirect: "follow" });
  return res.ok ? (await res.text()).slice(0, 3_000_000) : "";
}

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const strip = (html: string) => decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

/** The site's own pages: from the sitemap (WordPress and most others have one) and the front page's links. */
export async function sitePages(site: string): Promise<Page[]> {
  const base = publicUrl(site);
  const json = await cached(`pages:${base.origin}`, async () => {
    const pages = new Map<string, string>();
    const own = (u: URL) => u.hostname.replace(/^www\./, "") === base.hostname.replace(/^www\./, "") && !/\.(pdf|jpe?g|png|gif|webp|svg|zip|xml|docx?)$/i.test(u.pathname) && !/\/(wp-|feed|tag\/|category\/|author\/|cart|kurv|checkout)/i.test(u.pathname);
    const add = (href: string, title: string, from: string | URL) => {
      try {
        const u = new URL(decode(href), from);
        u.hash = "";
        u.search = "";
        if (/^https?:$/.test(u.protocol) && own(u) && !pages.has(u.toString())) pages.set(u.toString(), title);
      } catch {}
    };
    // The sitemap: an index points to the real ones (pages first).
    for (const path of ["/sitemap.xml", "/wp-sitemap.xml", "/sitemap_index.xml", "/page-sitemap.xml"]) {
      const xml = await get(new URL(path, base.origin).toString()).catch(() => "");
      if (!/<(urlset|sitemapindex)/.test(xml)) continue;
      const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => decode(m[1]));
      if (/<sitemapindex/.test(xml)) {
        const subs = locs.sort((a, b) => Number(/page|side/i.test(b)) - Number(/page|side/i.test(a))).filter((u) => !/post-sitemap|product|tag|category|author/i.test(u)).slice(0, 5);
        for (const sub of subs) for (const m of (await get(sub).catch(() => "")).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) add(m[1], "", sub);
      } else locs.forEach((u) => add(u, "", base));
      if (pages.size) break;
    }
    // The front page's links - they also give the pages their names.
    const html = await get(base.toString()).catch(() => "");
    for (const m of html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      const text = strip(m[2]).slice(0, 80);
      add(m[1], text, base);
      try {
        const u = new URL(decode(m[1]), base);
        u.hash = "";
        u.search = "";
        if (text && pages.has(u.toString()) && !pages.get(u.toString())) pages.set(u.toString(), text);
      } catch {}
    }
    return JSON.stringify([...pages].slice(0, 400).map(([url, title]) => ({ url, title })));
  });
  return JSON.parse(json) as Page[];
}

const STOP = new Set(["og", "i", "pa", "paa", "til", "med", "for", "the", "and", "de", "den", "det", "en", "et", "af", "vores", "jeres", "din", "dit"]);
const words = (s: string) => placeSlug(s).split("-").filter((w) => w.length > 1 && !STOP.has(w));

/** The best page for each place - only when it's a clear match (its words are in the page's address or name). */
export function matchPages(places: StartPlace[], pages: Page[]): Record<string, Page> {
  const out: Record<string, Page> = {};
  for (const p of places) {
    const want = words(p.name);
    if (!want.length) continue;
    let best: { page: Page; score: number } | null = null;
    for (const page of pages) {
      const path = new URL(page.url).pathname;
      const last = placeSlug(path.split("/").filter(Boolean).pop() ?? "");
      const hay = `${placeSlug(path)} ${placeSlug(page.title)}`;
      const hits = want.filter((w) => hay.includes(w)).length;
      let score = hits / want.length;
      if (last === placeSlug(p.name)) score += 1; // /minigolf/ for "Minigolf"
      if (p.group && words(p.group).some((w) => hay.includes(w))) score += 0.1;
      score -= path.split("/").filter(Boolean).length * 0.01; // a shorter address is the main page
      if (score >= 0.66 && want.some((w) => w.length >= 4 && hay.includes(w)) && (!best || score > best.score)) best = { page, score };
    }
    if (best) out[p.key] = best.page;
  }
  return out;
}
