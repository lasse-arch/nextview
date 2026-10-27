import "server-only";
import type { TourConfig } from "@/app/arpo/tour-lab/tours/types";
import { publicUrl } from "@/lib/site-digest";

/*
 * Live data from a customer's website (free pitches, rooms, units…): the
 * page as plain text with its links kept as [text](href), read with the
 * tour's pattern - every 10 minutes, no AI involved once the pattern exists
 * (Claude writes it once in the editor, see setupLiveData).
 */

export type LiveUnit = { name: string; size?: string; price?: string; from?: string; link?: string };
type LiveSpec = NonNullable<TourConfig["live"]>;

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/** HTML as readable text, links as [text](href) (made absolute against `base`). */
function htmlToText(html: string, base: URL): string {
  return decode(
    html
      .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, text: string) => {
        let abs = href;
        try {
          abs = new URL(decode(href), base).toString();
        } catch {}
        return ` [${text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}](${abs}) `;
      })
      .replace(/<(br|\/p|\/div|\/li|\/tr|\/h\d)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

/** Video, maps and the like - embeds that never hold a list of free units. */
const NOT_A_LIST = /youtube|youtu\.be|vimeo|google\.[a-z]+\/maps|maps\.google|facebook\.com\/plugins|instagram|spotify|recaptcha|googletagmanager|doubleclick/i;

/**
 * Pages the page shows inside itself - where many sites keep their lists
 * (events, bookings, free units): plain iframes, and booking/school systems
 * whose script builds the iframe in the browser (e.g. YoungCRM's event portal:
 * a <div id="youngcrm_event_portal" data-tags="…"> plus its embed script).
 */
function embedsOf(html: string, base: URL): string[] {
  const urls: string[] = [];
  const add = (src: string) => {
    try {
      const u = new URL(decode(src), base);
      if (/^https?:$/.test(u.protocol) && !NOT_A_LIST.test(u.href) && !urls.includes(u.href)) urls.push(u.href);
    } catch {}
  };
  for (const m of html.matchAll(/<iframe\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi)) add(m[1]);
  const ycrmScript = /<script\b[^>]*src\s*=\s*["'](https?:\/\/[^"']+\/eventportal\/embed)\/script["']/i.exec(html);
  const ycrmDiv = /<div\b[^>]*id\s*=\s*["']youngcrm_event_portal["']([^>]*)>/i.exec(html);
  if (ycrmScript) {
    const u = new URL(ycrmScript[1]);
    for (const m of (ycrmDiv?.[1] ?? "").matchAll(/data-([a-z0-9_-]+)\s*=\s*["']([^"']*)["']/gi)) if (m[1] !== "style_url") u.searchParams.set(m[1], decode(m[2]));
    add(u.href);
  }
  return urls.slice(0, 3);
}

/** A page as readable text, links as [text](href) - what the pattern runs on (and what Claude is shown). Pages it embeds are read too and added after it. */
export async function pageAsText(address: string, cacheSeconds = 600): Promise<string> {
  const url = publicUrl(address);
  const get = (u: URL | string) => fetch(u, { headers: { "User-Agent": "Mozilla/5.0 (compatible; ArpoTour/1.0)" }, signal: AbortSignal.timeout(15_000), next: { revalidate: cacheSeconds } });
  const res = await get(url);
  if (!res.ok) throw new Error(`${url.hostname} svarede ${res.status}.`);
  const html = (await res.text()).slice(0, 2_000_000);
  const embedded = await Promise.all(
    embedsOf(html, url).map(async (src) => {
      try {
        const r = await get(src);
        return r.ok ? `\n\n[Indlejret: ${src}]\n${htmlToText((await r.text()).slice(0, 2_000_000), new URL(src))}` : "";
      } catch {
        return "";
      }
    })
  );
  return htmlToText(html, url) + embedded.join("");
}

/** The units the pattern finds in the page text (first one per name). */
export function readUnits(text: string, spec: Pick<LiveSpec, "pattern" | "flags">): LiveUnit[] {
  const re = new RegExp(spec.pattern, `${(spec.flags ?? "").replace(/g/g, "")}g`);
  // A bounded text keeps even a clumsy pattern quick.
  text = text.slice(0, 400_000);
  const units: LiveUnit[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(re)) {
    const g = m.groups ?? {};
    const name = g.name?.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const clean = (v?: string) => v?.replace(/\s+/g, " ").trim() || undefined;
    units.push({ name, size: clean(g.size), price: clean(g.price), from: clean(g.from), link: clean(g.link) });
    if (units.length >= 300) break;
  }
  return units;
}

/** How often a tour's live page is read again (seconds) - the setting, within sensible bounds. */
export const refreshSeconds = (spec: Pick<LiveSpec, "refreshMinutes">) => Math.min(24 * 3600, Math.max(120, Math.round((spec.refreshMinutes ?? 10) * 60)));

/** The tour's live units right now (cached for the tour's refresh time) - empty if the page can't be read. */
export async function fetchLiveUnits(spec: LiveSpec): Promise<LiveUnit[]> {
  try {
    const exclude = new Set(spec.exclude ?? []);
    return readUnits(await pageAsText(spec.url, refreshSeconds(spec)), spec).filter((u) => !exclude.has(u.name));
  } catch {
    return [];
  }
}
