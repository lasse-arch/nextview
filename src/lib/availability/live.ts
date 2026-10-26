import "server-only";
import type { TourConfig } from "@/app/(app)/tour-lab/tours/types";
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

/** A page as readable text, links as [text](href) - what the pattern runs on (and what Claude is shown). */
export async function pageAsText(address: string, cacheSeconds = 600): Promise<string> {
  const url = publicUrl(address);
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; ArpoTour/1.0)" }, signal: AbortSignal.timeout(15_000), next: { revalidate: cacheSeconds } });
  if (!res.ok) throw new Error(`${url.hostname} svarede ${res.status}.`);
  const html = (await res.text()).slice(0, 2_000_000);
  return decode(
    html
      .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, text: string) => {
        let abs = href;
        try {
          abs = new URL(decode(href), url).toString();
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
