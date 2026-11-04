"use server";

import { requireTour } from "@/lib/auth";
import { readLimited, safeFetch } from "@/lib/safe-fetch";

/*
 * "Find dem på hjemmesiden" under Sprog → Links pr. sprog: each Danish page
 * the tour links to is read, and the page's own word for where it is in
 * other languages is taken (<link rel="alternate" hreflang="en" href="…">, as
 * WordPress' language plugins and most sites write it). Only public https
 * pages (safeFetch), only addresses the page itself gives - nothing guessed.
 * The page's contents are untrusted: only https addresses are kept.
 */

const UA = "Mozilla/5.0 (compatible; Nextview360-tour)";

/** The page's language versions: hreflang ("en", "de-DE" → "de") → address. */
async function alternates(page: string): Promise<Record<string, string>> {
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

export async function findLinkTranslations(
  slug: string,
  links: string[],
  langs: string[],
): Promise<{ ok: true; found: Record<string, Record<string, string>>; read: number; failed: number } | { ok: false; error: string }> {
  await requireTour(slug);
  const want = [...new Set((Array.isArray(langs) ? langs : []).map((l) => String(l).toLowerCase()).filter((l) => /^[a-z]{2,3}$/.test(l) && l !== "da"))];
  const pages = [...new Set((Array.isArray(links) ? links : []).map((l) => String(l).trim()).filter((l) => /^https:\/\/[^\s]+$/i.test(l) && l.length < 500))].slice(0, 60);
  if (!want.length) return { ok: false, error: "Vælg et sprog først." };
  if (!pages.length) return { ok: false, error: "Touren har ingen links til hjemmesider." };
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
  return { ok: true, found, read, failed };
}
