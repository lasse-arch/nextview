import { fetchPageText } from "@/lib/url-lead-scan";

export type ScrapedContactInfo = { name: string | null; phone: string | null; ownerName: string | null };

const TEL_HREF_PATTERN = /href=["']tel:([+\d\s()-]{6,20})["']/i;
const PHONE_CONTEXT_PATTERN =
  /(?:tlf\.?|telefon|ring (?:til )?os)[^\d]{0,15}((?:\+45\s?)?\d{2}[\s.]?\d{2}[\s.]?\d{2}[\s.]?\d{2})/i;
const OWNER_PATTERN =
  /(?:indehaver|ejer(?:en)?|ejes af)[:\s]{1,6}([A-ZÆØÅ][\p{L}'’-]+(?:\s[A-ZÆØÅ][\p{L}'’-]+){0,3})/iu;

function cleanPhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  const local = digits.replace(/^\+?45/, "");
  return local.length === 8 ? digits : null;
}

/**
 * Best-effort scrape of a plain website's front page for the handful of
 * fields a CVR lookup gives for free but that a Facebook page or a small
 * business's own site has no official register for. Loose heuristics only
 * (a tel: link, a "Tlf." mention, an "Indehaver"/"Ejer" credit) - any field
 * it can't confidently find comes back null rather than a guess, so a bad
 * scrape never overwrites a good one.
 */
export async function scrapeBasicContactInfo(url: string): Promise<ScrapedContactInfo> {
  const page = await fetchPageText(url);
  if (!page.ok) return { name: null, phone: null, ownerName: null };

  const telMatch = page.html.match(TEL_HREF_PATTERN);
  const contextMatch = page.text.match(PHONE_CONTEXT_PATTERN);
  const phone = (telMatch && cleanPhone(telMatch[1])) || (contextMatch && cleanPhone(contextMatch[1])) || null;

  const ownerMatch = page.text.match(OWNER_PATTERN);

  return {
    name: page.title?.trim() || null,
    phone,
    ownerName: ownerMatch ? ownerMatch[1].trim() : null,
  };
}
