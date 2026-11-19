import "server-only";
import { readLimited, safeFetch } from "@/lib/safe-fetch";
import { zenbiEvents, zenbiFormId, type ZenbiEvent } from "@/lib/availability/zenbi";

/*
 * "Næste rundvisninger" from the school's own page (e.g. Aalestrup's
 * "Besøg os" with "D. 25/11 2026", or "Onsdag d. 25. november kl. 19"): the
 * page is read as text (no scripts run), the dates in it are found, and the
 * coming ones are shown - cached 10 minutes. Only reads a public page; nothing
 * is sent to it. A Zenbi form is read from its own data instead (zenbi.ts).
 */

const cache = new Map<string, { at: number; events: ZenbiEvent[] }>();
const TEN_MINUTES = 10 * 60_000;
const MONTHS = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];
const DAYS = ["Søndag", "Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag"];

/** The page's words, without scripts, styles, tags or entities. */
function textOf(html: string): string {
  return html
    .replace(/<(script|style|noscript|template)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ");
}

/** Every date written on the page (numbers - 25/11 2026, 25.11.2026 - or words - 25. november 2026), as days. */
export function datesIn(text: string, now = new Date()): string[] {
  const out = new Set<string>();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const add = (day: number, month: number, yearRaw: string | undefined) => {
    let year = yearRaw ? Number(yearRaw.length === 2 ? `20${yearRaw}` : yearRaw) : now.getUTCFullYear();
    // No year: this year's, unless it's already well past - then next year's.
    if (!yearRaw && Date.UTC(year, month, day) < today - 60 * 86_400_000) year++;
    const d = new Date(Date.UTC(year, month, day));
    if (d.getUTCDate() === day && d.getUTCMonth() === month && year >= 2000 && year < 2100) out.add(d.toISOString().slice(0, 10));
  };
  for (const m of text.matchAll(/(?<![\d/.])(\d{1,2})\s*[/.]\s*(\d{1,2})(?:\s*[/.\-]?\s*(\d{4}|\d{2}(?!\d)))?(?![\d/])/g)) {
    const day = Number(m[1]);
    const month = Number(m[2]) - 1;
    // "kl. 19.00" or a price like "4.500" is no date: a day and a month must be in range, and a bare "19.00" (no year) needs a day-like context.
    if (day < 1 || day > 31 || month < 0 || month > 11) continue;
    if (!m[3] && !/\b(d\.|den|dato)\s*$/i.test(text.slice(Math.max(0, m.index! - 8), m.index))) continue;
    add(day, month, m[3]);
  }
  for (const m of text.toLowerCase().matchAll(/(\d{1,2})\.?\s*(januar|februar|marts|april|maj|juni|juli|august|september|oktober|november|december)(?:\s+(\d{4}))?/g)) add(Number(m[1]), MONTHS.indexOf(m[2]), m[3]);
  return [...out].sort();
}

/** "2026-11-25" → "Onsdag d. 25. november". */
const nice = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return `${DAYS[d.getUTCDay()]} d. ${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]}`;
};

/** The coming dates on a page (at most 8), past ones left out. */
export async function pageEvents(raw: string): Promise<ZenbiEvent[]> {
  let url: URL;
  try {
    url = new URL(String(raw).trim());
  } catch {
    throw new Error("Skriv hele adressen, fx https://www.skole.dk/besoeg-os/");
  }
  if (url.protocol !== "https:") throw new Error("Siden skal være https://.");
  const key = url.toString();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TEN_MINUTES) return hit.events;
  const res = await safeFetch(key, { headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0 (compatible; Nextview360-tour)" }, signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`Siden svarede ${res.status}.`);
  const today = new Date().toISOString().slice(0, 10);
  const events = datesIn(textOf((await readLimited(res, 3_000_000)).toString("utf8")))
    .filter((d) => d >= today)
    .slice(0, 8)
    .map((date) => ({ title: nice(date), date }));
  if (cache.size > 200) cache.clear();
  cache.set(key, { at: Date.now(), events });
  return events;
}

/** The tour's coming dates: from a Zenbi form, or from any page with the dates on it. */
export function tourEvents(source: string, field?: string): Promise<ZenbiEvent[]> {
  return zenbiFormId(source) ? zenbiEvents(source, field) : pageEvents(source);
}
