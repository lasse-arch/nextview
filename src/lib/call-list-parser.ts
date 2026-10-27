/**
 * Turns a block of pasted text (one lead per line - a CVR-register link, a
 * Facebook link, a plain website, a company name, or "Navn, By: telefon")
 * into a per-line spec the Ringeliste quick-add can act on. Deliberately dumb: no scraping
 * of Facebook/website content, since that's brittle for a marginal gain -
 * the one thing worth auto-resolving is a CVR number, because the official
 * lookup (src/lib/cvr.ts) already gives a clean, reliable company name/
 * address/contact for those.
 */

export type ParsedCallListLine = {
  /** The original pasted line, kept verbatim so it can be stored as a "Kilde"-note. */
  raw: string;
  /** 8-digit CVR number, if one could be found in the line. */
  cvrNumber: string | null;
  /** First http(s) URL found in the line, if any. */
  url: string | null;
  /** A typed lead with its number - "Navn, By: 12 34 56 78" - split into name, town and phone. */
  name?: string;
  city?: string | null;
  phone?: string;
};

// "Skagen Lagerudlejning: 31 21 51 66", "Chr. Bækgaard ApS, Aalborg: 98 15 10 10", "Firma - +45 40594070".
const NAME_PHONE_PATTERN = /^(.+?)\s*[:–-]\s*(?:tlf\.?\s*)?((?:\+|00)45[\s-]?)?((?:\d[\s-]?){7}\d)\s*$/i;

/** "Navn, By: 12 34 56 78" → name, town and phone (written the usual Danish way), or null if the line isn't like that. */
function parseNamePhone(line: string): { name: string; city: string | null; phone: string } | null {
  if (URL_PATTERN.test(line)) return null;
  const m = line.match(NAME_PHONE_PATTERN);
  if (!m) return null;
  const digits = m[3].replace(/\D/g, "");
  if (digits.length !== 8) return null;
  const [name, ...rest] = m[1].split(",").map((x) => x.trim());
  if (!name) return null;
  return { name, city: rest.join(", ") || null, phone: digits.replace(/(\d{2})(?=\d)/g, "$1 ") };
}

const CVR_URL_PATTERN = /virk\.dk\/[^\s"]*?\/virksomhed\/(\d{8})\b/i;
const BARE_CVR_PATTERN = /\b(\d{8})\b/;
const URL_PATTERN = /https?:\/\/[^\s"']+/i;

function extractCvrNumber(line: string): string | null {
  const fromUrl = line.match(CVR_URL_PATTERN);
  if (fromUrl) return fromUrl[1];

  // A bare 8-digit number is only trusted as a CVR number when the line
  // doesn't already look like some other kind of link (a Facebook/website
  // URL can easily contain 8 digits, e.g. a post ID, that isn't a CVR at all).
  if (URL_PATTERN.test(line) && !/virk\.dk|cvr/i.test(line)) return null;
  const bare = line.match(BARE_CVR_PATTERN);
  return bare ? bare[1] : null;
}

/** Best-effort, non-CVR company-name guess from a URL - the hostname (minus
 * "www.") plus, for something like a Facebook page, the first path segment
 * (the page's slug), so "Grøn Have" beats a bare "facebook.com". */
export function guessNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const firstSegment = parsed.pathname.split("/").filter(Boolean)[0];
    if (firstSegment && host.includes("facebook.com")) {
      return decodeURIComponent(firstSegment).replace(/[-_.]/g, " ");
    }
    return host;
  } catch {
    return url;
  }
}

export function parseCallListText(text: string): ParsedCallListLine[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((raw) => {
      // A typed name with a phone number: the number is a phone, never a CVR number.
      const typed = parseNamePhone(raw);
      if (typed) return { raw, cvrNumber: null, url: null, ...typed };
      const urlMatch = raw.match(URL_PATTERN);
      return {
        raw,
        cvrNumber: extractCvrNumber(raw),
        url: urlMatch ? urlMatch[0] : null,
      };
    });
}
