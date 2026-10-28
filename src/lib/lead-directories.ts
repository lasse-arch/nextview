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
 *  - friskolerne.dk/om-os/friskolekort - every friskole on Friskolernes map
 *    (the school's address, phone, e-mail and website, the head teacher as
 *    the contact, and its size as a note).
 */

export type DirectoryLead = {
  companyName: string;
  address: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  websiteUrl: string | null;
  /** The business's own page on the directory - kept as the lead's "Kilde". */
  sourceUrl: string;
  /** The person to ask for (e.g. a school's head teacher) - then contactPhone/contactEmail are theirs. */
  contactName?: string | null;
  /** More from the directory, kept as a note on the lead (the school's own number, its size …). */
  note?: string | null;
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
  if (host === "friskolerne.dk" && /^\/om-os\/friskolekort\/?$/.test(parsed.pathname)) return friskoleLeads();
  return null;
}

const FRISKOLERNE = "https://www.friskolerne.dk";

/**
 * Friskolernes map: the schools are written into a script the page loads
 * (title + an info box of HTML per school) - read from there.
 */
async function friskoleLeads(): Promise<DirectoryLead[]> {
  const page = await fetch(`${FRISKOLERNE}/om-os/friskolekort`, { headers: { "User-Agent": USER_AGENT } });
  if (!page.ok) throw new Error(`friskolerne.dk svarede ${page.status} - kunne ikke hente friskolekortet.`);
  const html = await page.text();
  // The map's data is in one of the page's own scripts (its name changes) - the one that has the schools in it.
  const scripts = [...html.matchAll(/<script[^>]+src="(\/typo3temp\/[^"]+\.js[^"]*)"/g)].map((m) => new URL(decodeEntities(m[1]), FRISKOLERNE).toString());
  let source = html;
  for (const src of scripts) {
    const res = await fetch(src, { headers: { "User-Agent": USER_AGENT } });
    const js = res.ok ? await res.text() : "";
    if (js.includes("maps-info-content")) {
      source = js;
      break;
    }
  }
  const seen = new Set<string>();
  const leads: DirectoryLead[] = [];
  for (const m of source.matchAll(/title:\s*'((?:\\'|[^'])*)'[\s\S]*?html:\s*'((?:\\'|[^'])*)'/g)) {
    const name = decodeEntities(m[1].replace(/\\'/g, "'")).trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const box = m[2].replace(/\\'/g, "'");
    // A block of the info box (the school's contact details, the head teacher, …) and a line in it.
    const block = (kind: string) => new RegExp(`maps-info-content__block--${kind}"([\\s\\S]*?)(?=maps-info-content__block--|$)`).exec(box)?.[1] ?? "";
    const line = (b: string, kind: string) => {
      const v = new RegExp(`maps-info-content__line--${kind}"><p>([\\s\\S]*?)</p>`).exec(b)?.[1];
      return v ? decodeEntities(v.replace(/<[^>]+>/g, "")).trim() || null : null;
    };
    const school = block("address");
    const leader = block("leader");
    const facts = block("school");
    const phone = (v: string | null) => (v && /\d{8}/.test(v.replace(/\s/g, "")) ? v.replace(/\s/g, "").replace(/(\d{2})(?=\d)/g, "$1 ") : null);
    const web = line(school, "web");
    const leaderName = line(leader, "name");
    const schoolPhone = phone(line(school, "phone"));
    const schoolEmail = line(school, "email");
    const leaderPhone = phone(line(leader, "phone"));
    const leaderEmail = line(leader, "email");
    const factLines = [...facts.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((x) => decodeEntities(x[1].replace(/<[^>]+>/g, "")).trim()).filter((x) => /:/.test(x));
    const note = [
      leaderName ? `Skoleleder: ${leaderName}${leaderPhone ? `, ${leaderPhone}` : ""}${leaderEmail ? `, ${leaderEmail}` : ""}` : null,
      schoolPhone || schoolEmail ? `Skolen: ${[schoolPhone, schoolEmail].filter(Boolean).join(", ")}` : null,
      ...factLines,
    ]
      .filter(Boolean)
      .join("\n");
    leads.push({
      companyName: name,
      address: [line(school, "address"), line(school, "zip-city")].filter(Boolean).join(", ") || null,
      // The head teacher is the one to call - the school's own number and mail when there's none.
      contactName: leaderName,
      contactPhone: leaderPhone ?? schoolPhone,
      contactEmail: leaderEmail ?? schoolEmail,
      websiteUrl: web ? (/^https?:/i.test(web) ? web : `https://${web}`) : null,
      sourceUrl: `${FRISKOLERNE}/om-os/friskolekort#${encodeURIComponent(name)}`,
      note: note || null,
    });
  }
  if (!leads.length) throw new Error("Kunne ikke læse skolerne på friskolekortet - siden er måske lavet om.");
  return leads;
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
