/**
 * Filter-based search against the official CVR register (distribution.virk.dk,
 * the same "cvr-permanent" Elasticsearch index src/lib/cvr.ts already looks
 * single companies up in by CVR number) - powers Leadgeneration's saved
 * filters. Confirmed live (not a frozen snapshot): a company founded today
 * shows up immediately.
 *
 * Two hard-won quirks of this index, found by direct testing:
 * - `wildcard` queries match against the *indexed* (analyzer-lowercased)
 *   terms, not the original text, so a wildcard pattern must itself be
 *   lowercased - "*Restaurant*" matches nothing, "*restaurant*" matches
 *   "Restauranter". `match` queries don't have this problem (the query text
 *   goes through the same analyzer at query time), which is why status and
 *   municipality below use `match` instead.
 * - `sammensatStatus`/`kommuneNavn` are analyzed text fields, not keywords -
 *   `term` (exact) queries against them silently return zero hits; `match`
 *   is required.
 */

type VirkAddress = {
  vejnavn?: string | null;
  husnummerFra?: number | null;
  husnummerTil?: number | null;
  bogstavFra?: string | null;
  bogstavTil?: string | null;
  postnummer?: number | null;
  postdistrikt?: string | null;
  kommune?: { kommuneNavn?: string | null } | null;
};

import { looksLikeWebsite } from "@/lib/cvr";

function formatVirkAddress(addr: VirkAddress | null | undefined): string | null {
  if (!addr) return null;
  let houseNumber = "";
  if (addr.husnummerFra != null) {
    houseNumber = `${addr.husnummerFra}${addr.bogstavFra ?? ""}`;
    if (addr.husnummerTil != null) houseNumber += `-${addr.husnummerTil}${addr.bogstavTil ?? ""}`;
  }
  const street = [addr.vejnavn, houseNumber].filter(Boolean).join(" ");
  const city = addr.postnummer && addr.postdistrikt ? `${addr.postnummer} ${addr.postdistrikt}` : addr.postdistrikt;
  return [street, city].filter(Boolean).join(", ") || null;
}

export type CvrSearchFilter = {
  /** Comma-separated free-text terms, any-of, matched against branchetekst. */
  industryQuery?: string | null;
  /** Comma-separated municipality names, any-of. */
  municipality?: string | null;
  activeOnly?: boolean;
  /** Founding-date window, "YYYY-MM-DD" - either or both bounds may be set. */
  foundedFrom?: string | null;
  foundedTo?: string | null;
};

export type CvrSearchHit = {
  cvr: string;
  name: string;
  address: string | null;
  industryText: string | null;
  /** The branche/DB07 code behind `industryText` (e.g. "561010"). */
  industryCode: string | null;
  foundedDate: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  website: string | null;
};

function splitTerms(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isConfigured(): boolean {
  return Boolean(process.env.CVR_API_USERNAME && process.env.CVR_API_PASSWORD);
}

export type CvrSearchResult = { ok: true; hits: CvrSearchHit[] } | { ok: false; error: string };

/**
 * Hard upper bound on `limit` below - this is still a single ES query
 * regardless of size, so raising it doesn't add extra round-trips against
 * the shared government service, but a runaway value (e.g. a bad manual
 * edit) shouldn't be able to ask it for everything at once either.
 */
export const MAX_LEAD_FILTER_RESULTS = 200;

export async function searchCvr(filter: CvrSearchFilter, limit = 50): Promise<CvrSearchResult> {
  limit = Math.min(Math.max(1, limit), MAX_LEAD_FILTER_RESULTS);
  if (!isConfigured()) {
    return { ok: false, error: "Officiel CVR-adgang er ikke konfigureret (CVR_API_USERNAME/CVR_API_PASSWORD)." };
  }

  const must: unknown[] = [];

  const industryTerms = splitTerms(filter.industryQuery);
  if (industryTerms.length > 0) {
    must.push({
      bool: {
        should: industryTerms.map((term) => ({
          wildcard: { "Vrvirksomhed.virksomhedMetadata.nyesteHovedbranche.branchetekst": `*${term.toLowerCase()}*` },
        })),
        minimum_should_match: 1,
      },
    });
  }

  const municipalities = splitTerms(filter.municipality);
  if (municipalities.length > 0) {
    must.push({
      bool: {
        should: municipalities.map((m) => ({
          match: { "Vrvirksomhed.virksomhedMetadata.nyesteBeliggenhedsadresse.kommune.kommuneNavn": m },
        })),
        minimum_should_match: 1,
      },
    });
  }

  if (filter.activeOnly !== false) {
    must.push({ match: { "Vrvirksomhed.virksomhedMetadata.sammensatStatus": "NORMAL" } });
  }

  if (filter.foundedFrom || filter.foundedTo) {
    const range: Record<string, string> = {};
    if (filter.foundedFrom) range.gte = filter.foundedFrom;
    if (filter.foundedTo) range.lte = filter.foundedTo;
    must.push({ range: { "Vrvirksomhed.virksomhedMetadata.stiftelsesDato": range } });
  }

  if (industryTerms.length === 0 && municipalities.length === 0 && !filter.foundedFrom && !filter.foundedTo) {
    return { ok: false, error: "Angiv mindst ét kriterie (branche, område eller periode)." };
  }

  const username = process.env.CVR_API_USERNAME!;
  const password = process.env.CVR_API_PASSWORD!;
  const auth = Buffer.from(`${username}:${password}`).toString("base64");

  let res: Response;
  try {
    res = await fetch("http://distribution.virk.dk/cvr-permanent/virksomhed/_search", {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        size: limit,
        query: { bool: { must } },
        sort: [{ "Vrvirksomhed.virksomhedMetadata.stiftelsesDato": "desc" }],
      }),
    });
  } catch {
    return { ok: false, error: "Kunne ikke kontakte det officielle CVR-register. Prøv igen senere." };
  }

  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: "Adgang til det officielle CVR-register blev afvist." };
  }
  if (!res.ok) {
    return { ok: false, error: "Det officielle CVR-register svarede med en fejl." };
  }

  const json = await res.json();
  const hits: unknown[] = json?.hits?.hits ?? [];

  const results: CvrSearchHit[] = hits
    .map((hit) => {
      const source = hit as { _source?: { Vrvirksomhed?: { cvrNummer?: number; virksomhedMetadata?: Record<string, unknown> } } };
      const v = source._source?.Vrvirksomhed;
      const meta = v?.virksomhedMetadata as
        | {
            nyesteNavn?: { navn?: string | null } | null;
            nyesteBeliggenhedsadresse?: VirkAddress | null;
            nyesteHovedbranche?: { branchetekst?: string | null; branchekode?: string | null } | null;
            stiftelsesDato?: string | null;
            nyesteKontaktoplysninger?: string[] | null;
          }
        | undefined;
      if (!v?.cvrNummer || !meta?.nyesteNavn?.navn) return null;

      const contactInfo: string[] = Array.isArray(meta.nyesteKontaktoplysninger) ? meta.nyesteKontaktoplysninger : [];

      return {
        cvr: String(v.cvrNummer),
        name: meta.nyesteNavn.navn,
        address: formatVirkAddress(meta.nyesteBeliggenhedsadresse),
        industryText: meta.nyesteHovedbranche?.branchetekst ?? null,
        industryCode: meta.nyesteHovedbranche?.branchekode ?? null,
        foundedDate: meta.stiftelsesDato ?? null,
        contactEmail: contactInfo.find((c) => c.includes("@")) ?? null,
        contactPhone: contactInfo.find((c) => !c.includes("@") && !looksLikeWebsite(c)) ?? null,
        website: contactInfo.find((c) => !c.includes("@") && looksLikeWebsite(c)) ?? null,
      };
    })
    .filter((h): h is CvrSearchHit => h !== null);

  return { ok: true, hits: results };
}
