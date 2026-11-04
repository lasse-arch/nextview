import "server-only";
import { readLimited, safeFetch } from "@/lib/safe-fetch";

/*
 * A page's own word for where it is in other languages
 * (<link rel="alternate" hreflang="en" href="…">, as WordPress' language
 * plugins and most shops write it). Only public https pages (safeFetch), only
 * addresses the page itself gives - nothing guessed. The page's contents are
 * untrusted: only https addresses are kept. Used by "Find dem på hjemmesiden"
 * (Sprog → Links pr. sprog) and by nextviewAI.
 */

const UA = "Mozilla/5.0 (compatible; Nextview360-tour)";

/** The page's language versions: hreflang ("en", "de-DE" → "de") → address. */
export async function alternates(page: string): Promise<Record<string, string>> {
  const res = await safeFetch(page, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return {};
  const html = (await readLimited(res, 2_000_000)).toString("utf8");
  const head = html.slice(0, html.search(/<\/head>/i) > 0 ? html.search(/<\/head>/i) : 400_000);
  const out: Record<string, string> = {};
  for (const [tag] of head.matchAll(/<link\b[^>]*>/gi)) {
    if (!/\brel=["']?alternate\b/i.test(tag)) continue;
    const lang = tag.match(/\bhreflang=["']?([a-zA-Z]{2,3})(?:[-_][a-zA-Z0-9]+)?["']?/)?.[1]?.toLowerCase();
    const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1]?.replace(/&amp;/g, "&");
    if (!lang || !href) continue;
    try {
      const u = new URL(href, res.url || page);
      if (u.protocol === "https:" && !u.username && !u.password && u.href.length < 500 && !out[lang]) out[lang] = u.href;
    } catch {}
  }
  return out;
}

/** For each link (https, up to 60): its address in each of `langs` that its page names. */
export async function linkAlternates(links: string[], langs: string[]): Promise<{ found: Record<string, Record<string, string>>; read: number; failed: number }> {
  const want = [...new Set(langs.map((l) => String(l).toLowerCase()).filter((l) => /^[a-z]{2,3}$/.test(l) && l !== "da"))];
  const pages = [...new Set(links.map((l) => String(l).trim()).filter((l) => /^https:\/\/[^\s]+$/i.test(l) && l.length < 500))].slice(0, 60);
  const found: Record<string, Record<string, string>> = Object.fromEntries(want.map((l) => [l, {}]));
  let read = 0;
  let failed = 0;
  // A few at a time - kind to the customer's site.
  for (let i = 0; i < pages.length; i += 6) {
    await Promise.all(
      pages.slice(i, i + 6).map(async (page) => {
        try {
          const alt = await alternates(page);
          read++;
          for (const l of want) if (alt[l] && alt[l] !== page) found[l][page] = alt[l];
        } catch {
          failed++;
        }
      }),
    );
  }
  return { found, read, failed };
}
