import "server-only";

/**
 * Directory pages that list many businesses at once - pasting such a link
 * on the ringeliste adds every business on it as its own lead, with the
 * contact details the directory has, instead of one lead for the page.
 *
 * Only directories we know the structure of (each needs its own small
 * reader), currently:
 *  - dk-camp.dk/campingpladser/ - every DK-CAMP campsite (name, address,
 *    phone, e-mail, website). A single campsite's page adds just that one.
 */

export type DirectoryLead = {
  companyName: string;
  address: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  websiteUrl: string | null;
  /** The business's own page on the directory - kept as the lead's "Kilde". */
  sourceUrl: string;
};

const USER_AGENT = "Mozilla/5.0 (compatible; Arpo)";
const DK_CAMP = "https://www.dk-camp.dk";

/** The directory leads behind a pasted link, or null when it isn't a known directory. */
export async function expandDirectoryLink(url: string): Promise<DirectoryLead[] | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^www\./, "");
  if (host === "dk-camp.dk" && /^\/campingpladser(\/|$)/.test(parsed.pathname)) {
    const slug = parsed.pathname.replace(/^\/campingpladser\/?/, "").replace(/\/$/, "");
    return dkCampLeads(slug || null);
  }
  return null;
}

type DkCampItem = { url: string; title: string; address: string | null };

async function dkCampLeads(onlySlug: string | null): Promise<DirectoryLead[]> {
  // The campsite list on the page is filled in by the site's own JavaScript
  // from this endpoint - the same call, with no filters, returns them all.
  const res = await fetch(`${DK_CAMP}/api/campsites/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": USER_AGENT },
    body: JSON.stringify({ culture: "da", countOnly: false, campaignId: null, filter: [], distances: [], adults: 0, children: [], flexibility: 0 }),
  });
  if (!res.ok) throw new Error(`dk-camp.dk svarede ${res.status} - kunne ikke hente campingpladserne.`);
  const data = (await res.json()) as { items?: DkCampItem[] };
  let items = (data.items ?? []).filter((i) => i.title && i.url);
  if (onlySlug) items = items.filter((i) => i.url.replace(/\/$/, "").endsWith(`/${onlySlug}`));

  // Phone, e-mail and website are only on each campsite's own page.
  return mapWithConcurrency(items, 8, async (item) => {
    const sourceUrl = new URL(item.url, DK_CAMP).toString();
    const contact = await dkCampContact(sourceUrl).catch(() => ({ phone: null, email: null, website: null }));
    return {
      companyName: item.title.trim(),
      address: item.address?.trim() || null,
      contactPhone: contact.phone,
      contactEmail: contact.email,
      websiteUrl: contact.website,
      sourceUrl,
    };
  });
}

/** The contact buttons on a campsite's page (marked data-tracking="phone"/"email"/"homepage"). */
async function dkCampContact(pageUrl: string): Promise<{ phone: string | null; email: string | null; website: string | null }> {
  const res = await fetch(pageUrl, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) return { phone: null, email: null, website: null };
  const html = await res.text();
  const tracked = (kind: string) => {
    for (const tag of html.match(/<a\b[^>]*>/g) ?? []) {
      if (tag.includes(`data-tracking="${kind}"`)) return decodeEntities(/href="([^"]*)"/.exec(tag)?.[1] ?? "");
    }
    return "";
  };
  const phone = tracked("phone").replace(/^tel:/, "");
  const email = tracked("email").replace(/^mailto:/, "").trim();
  const website = tracked("homepage").trim();
  return {
    phone: normalizeDanishPhone(phone),
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.toLowerCase() : null,
    website: /^https?:\/\//i.test(website) ? website : null,
  };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&");
}

/** "+45 2464 7841" → "24647841"; anything that isn't a Danish number is kept as written. */
function normalizeDanishPhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return null;
  const local = digits.replace(/^(\+45|0045)/, "");
  return /^\d{8}$/.test(local) ? local : raw.trim() || null;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    })
  );
  return results;
}
