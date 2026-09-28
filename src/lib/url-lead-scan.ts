import crypto from "node:crypto";
import { lookupCvrNumber } from "@/lib/cvr";

const FETCH_TIMEOUT_MS = 15_000;
const USER_AGENT = "Nextview360 CRM (leadgeneration; kontakt: admin@nextview360.dk)";

/** How many linked article pages a single scan follows from a hub/list page -
 * capped so a big news site's frontpage doesn't turn one "Scan nu" click (or
 * one daily cron tick) into dozens of outbound requests. */
const MAX_ARTICLE_LINKS = 15;
/** Politeness pause between article fetches - these all go to the same
 * external site back-to-back, unlike the CVR-lookup calls elsewhere which
 * spread across many different sites. */
const ARTICLE_FETCH_DELAY_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type PageFetchResult = { ok: true; html: string; text: string; title: string | null } | { ok: false; error: string };

/** Just the handful of entities that show up in a <title> tag or plain body
 * text often enough to matter - full named-entity coverage lives in
 * email-sync-service.ts for actual e-mail bodies, which see a wider range. */
function decodeCommonEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function stripHtml(html: string): string {
  return decodeCommonEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

export async function fetchPageText(url: string): Promise<PageFetchResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: "Ugyldig URL." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "URL'en skal starte med http:// eller https://." };
  }

  try {
    const res = await fetch(parsed.toString(), {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false, error: `Siden svarede med fejl ${res.status}.` };

    const html = await res.text();
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    return {
      ok: true,
      html,
      text: stripHtml(html),
      title: titleMatch ? decodeCommonEntities(titleMatch[1]).trim() : null,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? `Kunne ikke hente siden: ${err.message}` : "Kunne ikke hente siden." };
  }
}

/**
 * Same-site links found in a page's raw HTML (before stripping tags),
 * resolved against `baseUrl` - used to follow a hub/list page (a news
 * frontpage, a brancheliste) into the actual article pages it links to,
 * since those are where a CVR number is actually likely to be mentioned,
 * not the list page itself. Off-site links (ads, social share buttons,
 * footer links to other domains) are dropped; the base page itself is
 * dropped too, so it isn't "crawled" a second time as one of its own links.
 */
export function extractLinks(html: string, baseUrl: string): string[] {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }

  const links = new Set<string>();
  for (const match of html.matchAll(/<a\s[^>]*href\s*=\s*["']([^"']+)["']/gi)) {
    let resolved: URL;
    try {
      resolved = new URL(match[1], base);
    } catch {
      continue;
    }
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") continue;
    if (resolved.hostname !== base.hostname) continue;
    resolved.hash = "";
    if (resolved.toString().replace(/\/$/, "") === base.toString().replace(/\/$/, "")) continue;
    links.add(resolved.toString());
  }
  return [...links];
}

/** Finds every 8-digit CVR number mentioned near the word "CVR" in `text` -
 * loose enough to catch "CVR-nr. 12345678", "CVR: 12 34 56 78", "(CVR 12345678)". */
export function extractCvrNumbers(text: string): string[] {
  const pattern = /CVR[^\d]{0,20}(\d[\d\s]{6,10}\d)/gi;
  const found = new Set<string>();
  for (const match of text.matchAll(pattern)) {
    const digits = match[1].replace(/\s/g, "");
    if (digits.length === 8) found.add(digits);
  }
  return [...found];
}

export function hashContent(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export type CvrLeadHit = {
  cvr: string;
  name: string;
  address: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  ownerName: string | null;
};

export type UrlScanResult =
  | { ok: true; cvrNumbers: string[]; hits: CvrLeadHit[]; contentHash: string; title: string | null; articlesScanned: number }
  | { ok: false; error: string };

/**
 * Scans a page - and, if it looks like a hub/list page (a news frontpage, a
 * brancheliste), the actual articles it links to - for CVR-number mentions,
 * resolving each via the official lookup (src/lib/cvr.ts) rather than
 * trusting whatever company name text happens to appear near the number.
 * A list page itself almost never mentions a CVR number directly - the
 * teaser text is too short - so the real target is the up-to-
 * MAX_ARTICLE_LINKS same-site pages it links to, which get scanned the same
 * way. Passing a direct article URL still works exactly as before: it just
 * won't have any of its own links worth following (or they'll come back
 * with nothing new, which is harmless). A page with no CVR mentions
 * anywhere comes back with an empty hit list, not an error - that's a
 * legitimate outcome for most pages.
 */
export async function scanUrlForCvrLeads(url: string): Promise<UrlScanResult> {
  const page = await fetchPageText(url);
  if (!page.ok) return page;

  const articleLinks = extractLinks(page.html, url).slice(0, MAX_ARTICLE_LINKS);
  const pageTexts = [page.text];
  for (const link of articleLinks) {
    const article = await fetchPageText(link);
    if (article.ok) pageTexts.push(article.text);
    await sleep(ARTICLE_FETCH_DELAY_MS);
  }

  const cvrNumbers = [...new Set(pageTexts.flatMap((text) => extractCvrNumbers(text)))];
  const hits: CvrLeadHit[] = [];

  for (const cvr of cvrNumbers) {
    const result = await lookupCvrNumber(cvr);
    if (result.ok) {
      hits.push({
        cvr,
        name: result.data.name,
        address: result.data.address,
        contactEmail: result.data.email,
        contactPhone: result.data.phone,
        ownerName: result.data.contactName,
      });
    }
  }

  // Hashed together with the list of links found (not just the hub page's
  // own text), so a genuinely new article appearing shows up as "changed"
  // for the daily watched-URL re-scan even when the hub page's own visible
  // teaser text barely moves.
  const contentHash = hashContent(page.text + "\n" + [...articleLinks].sort().join("\n"));

  return { ok: true, cvrNumbers, hits, contentHash, title: page.title, articlesScanned: articleLinks.length };
}
