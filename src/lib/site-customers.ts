import "server-only";
import { prisma } from "@/lib/db";
import { dealName, needsDeliveryLink } from "@/lib/labels";

/*
 * The customer band on the website's front page ("Virksomheder, der har
 * valgt Nextview360"): every customer whose tour is out there - by the logo
 * in their published tour, else by name. A new customer appears by itself
 * the day their tour goes online (published in Arpo, or their deal set to
 * LIVE with a tour link). Only the name and the logo already shown in their
 * public tour leave here - nothing else from the deal.
 */

export type SiteCustomer = { name: string; logo: string | null; logoOnLight: boolean };

/** Taken off the website on the owner's request - never shown in the band. */
const HIDDEN = ["jalsa", "is kompagniet"];

/** A logo we show: one of our own files ("/…") or an https address - nothing else (no data:, javascript: …). */
function safeLogo(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 500) return null;
  if (/^\/[^/\\]/.test(v) || /^https:\/\/[^\s"'<>]+$/i.test(v)) return v;
  return null;
}

export async function siteCustomers(): Promise<SiteCustomer[]> {
  const [tours, deals] = await Promise.all([
    prisma.tour.findMany({
      where: { OR: [{ published: true }, { liveVersion: { not: null } }] },
      select: { name: true, config: true, dealId: true, deal: { select: { companyName: true, displayName: true, stage: true, churnedAt: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.deal.findMany({
      where: { stage: "LIVE", churnedAt: null },
      select: { id: true, companyName: true, displayName: true, items: { where: { url: { not: null } }, select: { productType: true } } },
      orderBy: { liveAt: "asc" },
    }),
  ]);
  const out = new Map<string, SiteCustomer>();
  const add = (c: SiteCustomer) => {
    const key = c.name.trim().toLowerCase();
    if (!key || HIDDEN.some((h) => key.includes(h))) return;
    const had = out.get(key);
    if (!had || (!had.logo && c.logo)) out.set(key, c);
  };
  const withTour = new Set<string>();
  for (const t of tours) {
    // A customer who has left isn't shown, even if an old tour of theirs is still up.
    if (t.deal?.churnedAt) continue;
    if (t.dealId) withTour.add(t.dealId);
    const cfg = (t.config ?? {}) as { brand?: unknown; logo?: unknown; logoOnLight?: unknown };
    const name = t.deal ? dealName(t.deal) : typeof cfg.brand === "string" && cfg.brand.trim() ? cfg.brand : t.name;
    add({ name: name.slice(0, 80), logo: safeLogo(cfg.logo), logoOnLight: cfg.logoOnLight === true });
  }
  for (const d of deals) {
    if (withTour.has(d.id)) continue;
    if (!d.items.some((i) => needsDeliveryLink(i.productType) && !/hjemmeside/i.test(i.productType))) continue;
    add({ name: dealName(d).slice(0, 80), logo: null, logoOnLight: false });
  }
  return [...out.values()];
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The band's inside, as HTML: the list twice over, so it can run without a seam. */
export function customerBandHtml(list: SiteCustomer[]): string {
  if (!list.length) return "";
  const one = list
    .map((c) =>
      c.logo
        ? `<li><img src="${esc(c.logo)}" alt="${esc(c.name)}" loading="lazy" decoding="async" class="${c.logoOnLight ? "on-light" : "on-dark"}"></li>`
        : `<li><span>${esc(c.name)}</span></li>`,
    )
    .join("");
  const dur = Math.max(30, list.length * 4);
  return `<ul class="cb-track" style="--cb-dur:${dur}s">${one}${one.replace(/<li>/g, '<li aria-hidden="true">')}</ul>`;
}
