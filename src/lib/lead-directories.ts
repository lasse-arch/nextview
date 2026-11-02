import "server-only";
import { scrapeBasicContactInfo } from "@/lib/website-contact-scrape";
import { fetchPageText } from "@/lib/url-lead-scan";

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
 *  - deg.dk/danmarkskort-over-medlemsskoler - every member school of
 *    Danske Erhvervsskoler og -Gymnasier (the main departments; address,
 *    phone, e-mail and website from the map's info box, the departments and
 *    educations as a note).
 *  - danskegymnasier.dk/find-gymnasier/ - every gymnasium on Danske
 *    Gymnasier's map (address, phone, e-mail, website, the rektor as contact).
 *  - fgu.dk/find-din-lokale-fgu-institution/ - the 27 FGU institutions
 *    (name and website there; phone, e-mail and address read from each
 *    institution's own website).
 *  - privateskoler.dk/skoler/ - every member school of Danmarks Private
 *    Skoler (name, address, website); the phone number is fetched from each
 *    school's own website (front page, else its contact page).
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
  if (host === "deg.dk" && /^\/danmarkskort-over-medlemsskoler\/?$/.test(parsed.pathname)) return degLeads();
  if (host === "danskegymnasier.dk" && /^\/find-gymnasier\/?$/.test(parsed.pathname)) return gymnasiumLeads();
  if (host === "fgu.dk" && /^\/find-din-lokale-fgu-institution\/?$/.test(parsed.pathname)) return fguLeads();
  if (host === "privateskoler.dk" && /^\/skoler(\/(page\/\d+\/?)?)?$/.test(parsed.pathname)) return privateskoleLeads();
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

/** A piece of HTML as its lines of text (paragraphs, line breaks, blocks). */
function htmlLines(h: string): string[] {
  return decodeEntities(h.replace(/<(br|\/p|p|\/div|div|\/li|li|\/h\d|h\d|\/td|td|\/tr)[^>]*>/gi, "\n").replace(/<[^>]+>/g, " "))
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}
const danishPhone = (v: string | null | undefined) => {
  const d = (v ?? "").replace(/[^\d]/g, "").replace(/^45(?=\d{8}$)/, "");
  return d.length === 8 ? d.replace(/(\d{2})(?=\d)/g, "$1 ") : null;
};
const withScheme = (v: string | null | undefined) => (v ? (/^https?:\/\//i.test(v) ? v : `https://${v.replace(/^\/\//, "")}`) : null);

const DEG = "https://deg.dk";

/**
 * Danske Erhvervsskoler og -Gymnasier's map: its schools are written into
 * the page (name, place, which school a department belongs to); each main
 * school's details come from the map's own info box (the same request a
 * visitor's click makes), 8 at a time.
 */
async function degLeads(): Promise<DirectoryLead[]> {
  const page = await fetch(`${DEG}/danmarkskort-over-medlemsskoler`, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(20_000) });
  if (!page.ok) throw new Error(`deg.dk svarede ${page.status} - kunne ikke hente skolekortet.`);
  const html = await page.text();
  const mapId = /"otMaps":\{"id":"(\d+)"/.exec(html)?.[1] ?? "3";
  const at = html.indexOf('"markers":[');
  if (at < 0) throw new Error("Kunne ikke læse skolerne på deg.dk - siden er måske lavet om.");
  type Marker = { id?: string; title?: string; otmm_parent_memberschool?: string | null; otmm_hide_school?: string | null };
  let markers: Marker[] = [];
  try {
    // The markers are a JSON array inside the page's settings - read up to its end.
    let depth = 0;
    let end = at + 10;
    for (let i = at + 10, inStr = false; i < html.length; i++) {
      const c = html[i];
      if (inStr) {
        if (c === "\\") i++;
        else if (c === '"') inStr = false;
      } else if (c === '"') inStr = true;
      else if (c === "[" || c === "{") depth++;
      else if (c === "]" || c === "}") {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    markers = JSON.parse(html.slice(at + 10, end));
  } catch {
    throw new Error("Kunne ikke læse skolerne på deg.dk - siden er måske lavet om.");
  }
  // The member schools shown on the map, main departments only (a department is noted on its school).
  const shown = markers.filter((m) => m.id && m.title && m.otmm_hide_school !== "1");
  const main = shown.filter((m) => !m.otmm_parent_memberschool);
  if (!main.length) throw new Error("Fandt ingen skoler på deg.dk.");
  return mapWithConcurrency(main, 8, async (m) => {
    const name = decodeEntities(m.title!).replace(/\s*\((?:Hovedafdeling)(?:\s*-\s*[^)]*)?\)\s*$/i, "").trim();
    let address: string | null = null;
    let phone: string | null = null;
    let email: string | null = null;
    let website: string | null = null;
    let departments: string[] = [];
    try {
      const res = await fetch(`${DEG}/ot_maps/renderInfoBox?${new URLSearchParams({ ot_maps_id: mapId, node_id: m.id! })}`, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(15_000) });
      if (res.ok) {
        const box = await res.text();
        const lines = htmlLines(box);
        const zip = lines.findIndex((l) => /^\d{4}\s+\S/.test(l));
        if (zip > 0) address = `${lines[zip - 1]}, ${lines[zip]}`;
        phone = danishPhone(lines.find((l) => /^\+?[\d\s]{8,14}$/.test(l)));
        email = /href="mailto:([^"?]+)/i.exec(box)?.[1] ?? lines.find((l) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(l)) ?? null;
        website = withScheme(/href="((?:https?:)?\/\/[^"]+|www\.[^"]+)"/i.exec(box.replace(/href="mailto:[^"]*"/gi, ""))?.[1] ?? lines.find((l) => /^[\w.-]+\.(dk|com|eu|net|org)\/?$/i.test(l)));
        const sub = lines.findIndex((l) => /^Underafdeling/i.test(l));
        if (sub >= 0) departments = lines.slice(sub + 1, sub + 21);
      }
    } catch {
      // the lead is still made, with what the map had
    }
    return {
      companyName: name.slice(0, 120),
      address,
      contactPhone: phone,
      contactEmail: email ? decodeEntities(email) : null,
      websiteUrl: website,
      sourceUrl: `${DEG}/danmarkskort-over-medlemsskoler#${encodeURIComponent(name)}`,
      note: departments.length ? `Afdelinger: ${departments.join("; ")}` : null,
    };
  });
}

const DANSKE_GYMNASIER = "https://danskegymnasier.dk";

/** Danske Gymnasier's map: every school is a hidden block in the page with its rektor, address, phone, e-mail and website. */
async function gymnasiumLeads(): Promise<DirectoryLead[]> {
  const page = await fetch(`${DANSKE_GYMNASIER}/find-gymnasier/`, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(20_000) });
  if (!page.ok) throw new Error(`danskegymnasier.dk svarede ${page.status} - kunne ikke hente gymnasierne.`);
  const html = await page.text();
  const seen = new Set<string>();
  const leads: DirectoryLead[] = [];
  for (const m of html.matchAll(/class="wpv-addon-maps-marker [^"]*"[^>]*>([\s\S]*?)<\/div>/g)) {
    const box = m[1];
    const lines = htmlLines(box);
    const name = (lines[0] ?? "").slice(0, 120);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const flat = decodeEntities(box.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
    const rektor = lines.find((l) => /^Rektor\b/i.test(l))?.replace(/^Rektor\s+/i, "") ?? null;
    const zip = lines.findIndex((l) => /^\d{4}\s+\S/.test(l));
    const address = zip > 0 && !/^Rektor\b/i.test(lines[zip - 1]) ? `${lines[zip - 1]}, ${lines[zip]}` : zip >= 0 ? lines[zip] : null;
    const phone = danishPhone(/Tlf\.?:?\s*((?:\+45\s?)?[\d\s]{8,11})/i.exec(flat)?.[1]);
    const email = /href="mailto:([^"?]+)/i.exec(box)?.[1] ?? null;
    const website = withScheme(/<a [^>]*href="(?!mailto:)([^"]+)"/i.exec(box)?.[1]);
    leads.push({
      companyName: name,
      address,
      contactName: rektor,
      contactPhone: phone,
      contactEmail: email ? decodeEntities(email) : null,
      websiteUrl: website,
      sourceUrl: `${DANSKE_GYMNASIER}/find-gymnasier/#${encodeURIComponent(name)}`,
      note: rektor ? `Rektor: ${rektor}` : null,
    });
  }
  if (!leads.length) throw new Error("Kunne ikke læse gymnasierne på danskegymnasier.dk - siden er måske lavet om.");
  return leads;
}

const FGU = "https://fgu.dk";

/**
 * A Danish street address in a page's text ("Sohngårdsholmsvej 51, 9000
 * Aalborg"): a street ending like a street (…vej, …gade, … allé …) and a
 * number, then a postcode and a town - labels in front ("Hovedadresse",
 * "Afdeling") left out.
 */
export function danishAddress(text: string): string | null {
  const m =
    /((?:[A-ZÆØÅ][\wæøåÆØÅ.'-]*\s+){0,3}?(?:[A-ZÆØÅa-zæøå][\wæøåÆØÅ.'-]*?\s?)?(?:[Vv]ej|[Gg]ade|[Aa]lle|[Aa]llé|[Bb]oulevard|[Pp]lads|[Ss]træde|[Tt]orv|[Vv]ænge|[Vv]ænget|[Hh]ave|[Bb]akke|[Bb]akken|[Pp]ark|[Pp]arken|[Cc]entret|[Ss]ti|[Tt]oft|[Tt]often|[Gg]ård|[Hh]olm|[Bb]ro|[Ee]ngen|[Mm]arken|[Ll]økke|[Ll]økken|[Vv]ang|[Dd]al|[Hh]øj)(?:en|et)?\s\d{1,4}\s?[A-Za-z]?)\b[,.]?\s+(?:\d{1,2}\.?\s*(?:[Ss]al|th|tv|mf)\.?,?\s+)?(?:[^\d\s]{1,12}\s+)?(\d{4})\s+([A-ZÆØÅ][a-zæøå]+(?:\s(?:[NSVØCK]|SV|SØ|NV|NØ)\b)?)/.exec(text);
  if (!m) return null;
  let street = m[1].trim();
  for (let k = 0; k < 3; k++) street = street.replace(/^(?:hovedadresse[r]?|besøgsadresse[r]?|adresse[r]?|hovedafdeling(?:en)?|afdeling(?:en)?|kontakt|find)[:\s]+/i, "").trim();
  return `${street}, ${m[2]} ${m[3]}`;
}

/** A website's own contact details: phone (tel: link or "Tlf."), e-mail (mailto) and a Danish address (street, postcode and town) - best effort, through the safe fetch. */
async function siteContact(url: string): Promise<{ phone: string | null; email: string | null; address: string | null }> {
  const page = await fetchPageText(url).catch(() => null);
  if (!page?.ok) return { phone: null, email: null, address: null };
  const tel = /href=["']tel:((?:[+\d\s()-]|%20){6,30})["']/i.exec(page.html)?.[1]?.replace(/%20/g, " ");
  const ctx = /(?:tlf\.?|telefon)[^\d]{0,15}((?:\+45\s?)?\d{2}[\s.]?\d{2}[\s.]?\d{2}[\s.]?\d{2})/i.exec(page.text)?.[1];
  const email = /href=["']mailto:([^"'?\s]+@[^"'?\s]+)/i.exec(page.html)?.[1] ?? null;
  return { phone: danishPhone(tel) ?? danishPhone(ctx), email: email ? decodeEntities(email) : null, address: danishAddress(page.text) };
}

/** FGU Danmark's list of the FGU institutions: a button per institution, with its website - the details come from that site. */
async function fguLeads(): Promise<DirectoryLead[]> {
  const page = await fetch(`${FGU}/find-din-lokale-fgu-institution/`, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(20_000) });
  if (!page.ok) throw new Error(`fgu.dk svarede ${page.status} - kunne ikke hente FGU-institutionerne.`);
  const html = await page.text();
  const seen = new Set<string>();
  const list: { name: string; website: string }[] = [];
  for (const m of html.matchAll(/<a [^>]*href="(https?:\/\/[^"]+)"[^>]*>\s*(?:<[^>]+>\s*)*\d+\.\s*(FGU[^<]+)</g)) {
    const name = decodeEntities(m[2]).replace(/\s+/g, " ").trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    list.push({ name: name.slice(0, 120), website: decodeEntities(m[1]) });
  }
  if (!list.length) throw new Error("Kunne ikke læse FGU-institutionerne på fgu.dk - siden er måske lavet om.");
  const deadline = Date.now() + 180_000;
  return mapWithConcurrency(list, 8, async (inst) => {
    let c = { phone: null as string | null, email: null as string | null, address: null as string | null };
    if (Date.now() < deadline) {
      c = await siteContact(inst.website);
      if ((!c.phone || !c.address) && Date.now() < deadline) {
        const k = await siteContact(new URL("/kontakt", inst.website).toString());
        c = { phone: c.phone ?? k.phone, email: c.email ?? k.email, address: c.address ?? k.address };
      }
    }
    return {
      companyName: inst.name,
      address: c.address,
      contactPhone: c.phone,
      contactEmail: c.email,
      websiteUrl: inst.website,
      sourceUrl: `${FGU}/find-din-lokale-fgu-institution/#${encodeURIComponent(inst.name)}`,
      note: "En FGU-institution har 1-4 skoler. Kontaktoplysninger fundet på institutionens hjemmeside - tjek dem.",
    };
  });
}

const PRIVATSKOLER = "https://privateskoler.dk";

/**
 * Danmarks Private Skoler's school list: one page with every member school
 * (name, street, postcode and town, website). No phone numbers there - each
 * school's own website is asked (its front page, then /kontakt), the same
 * best-effort read as a pasted website link, through the safe fetch.
 */
async function privateskoleLeads(): Promise<DirectoryLead[]> {
  const page = await fetch(`${PRIVATSKOLER}/skoler/`, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(20_000) });
  if (!page.ok) throw new Error(`privateskoler.dk svarede ${page.status} - kunne ikke hente skolelisten.`);
  const html = await page.text();
  const text = (v: string) => decodeEntities(v.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
  const seen = new Set<string>();
  const schools: { name: string; address: string | null; website: string | null }[] = [];
  for (const m of html.matchAll(/<div class="skole-content-data">([\s\S]*?)<\/div>/g)) {
    const block = m[1];
    const name = text(/class="skoler_title">([\s\S]*?)<\/p>/.exec(block)?.[1] ?? "");
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const lines = [...block.matchAll(/class="skoler_txt">([\s\S]*?)<\/p>/g)].map((x) => text(x[1])).filter(Boolean);
    const href = /class="skoler_link">[\s\S]*?href="([^"]+)"/.exec(block)?.[1];
    const website = href && /^https?:\/\//i.test(decodeEntities(href)) ? decodeEntities(href) : null;
    schools.push({ name: name.slice(0, 120), address: lines.join(", ").slice(0, 200) || null, website });
  }
  if (!schools.length) throw new Error("Kunne ikke læse skolerne på privateskoler.dk - siden er måske lavet om.");

  // The phone lookups stop after 3 minutes, so the add stays well inside the server's limit - a school not reached keeps its website to look up.
  const deadline = Date.now() + 180_000;
  return mapWithConcurrency(schools, 10, async (school) => {
    let phone: string | null = null;
    if (school.website && Date.now() < deadline) {
      phone = (await scrapeBasicContactInfo(school.website).catch(() => null))?.phone ?? null;
      if (!phone && Date.now() < deadline) {
        try {
          phone = (await scrapeBasicContactInfo(new URL("/kontakt", school.website).toString()).catch(() => null))?.phone ?? null;
        } catch {
          // not a usable address
        }
      }
    }
    return {
      companyName: school.name,
      address: school.address,
      contactPhone: phone,
      contactEmail: null,
      websiteUrl: school.website,
      sourceUrl: `${PRIVATSKOLER}/skoler/#${encodeURIComponent(school.name)}`,
      note: phone ? "Telefon fundet på skolens hjemmeside - tjek at det er skolens hovednummer." : school.website ? "Intet telefonnummer fundet på skolens hjemmeside." : null,
    };
  });
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
    .replace(/&amp;/g, "&")
    .replace(/&shy;|\u00ad/g, "")
    .replace(/&nbsp;/g, " ");
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
