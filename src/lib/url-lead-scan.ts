import crypto from "node:crypto";
import { lookupCvrNumber } from "@/lib/cvr";

const FETCH_TIMEOUT_MS = 15_000;
const USER_AGENT = "Nextview360 CRM (leadgeneration; kontakt: admin@nextview360.dk)";

export type PageFetchResult = { ok: true; text: string; title: string | null } | { ok: false; error: string };

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
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
    return { ok: true, text: stripHtml(html), title: titleMatch ? titleMatch[1].trim() : null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? `Kunne ikke hente siden: ${err.message}` : "Kunne ikke hente siden." };
  }
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
  | { ok: true; cvrNumbers: string[]; hits: CvrLeadHit[]; contentHash: string; title: string | null }
  | { ok: false; error: string };

/**
 * Scans a page for CVR-number mentions and resolves each via the official
 * lookup (src/lib/cvr.ts) - the same source of truth the rest of the app
 * uses, rather than trusting whatever company name text happens to appear
 * near the number. A page with no CVR mentions comes back with an empty hit
 * list, not an error - that's a legitimate outcome (most pages won't have one).
 */
export async function scanUrlForCvrLeads(url: string): Promise<UrlScanResult> {
  const page = await fetchPageText(url);
  if (!page.ok) return page;

  const cvrNumbers = extractCvrNumbers(page.text);
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

  return { ok: true, cvrNumbers, hits, contentHash: hashContent(page.text), title: page.title };
}
