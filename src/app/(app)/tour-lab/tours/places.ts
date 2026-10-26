import type { TourConfig } from "./types";

/*
 * A spot in the tour is a link with the scan point (ss) and, if picked in
 * the editor, the exact view (rot). It is either an MPSkins tour link
 * (explore.nextview360.dk/…?ss=) or - for tours connected straight to a
 * Matterport model - Matterport's own (my.matterport.com/show/?m=…&ss=).
 * Anything else is a page out of the tour.
 */

export const isPlaceHref = (href: string) => /explore\.nextview360\.dk|my\.matterport\.com\/show/.test(href);

/** The point id of a "#punkt:<id>" link (a point on the drone scene or map), else null. */
export const pointOfHref = (href: string) => (href.startsWith("#punkt:") ? href.slice(7) : null);

/** A link that stays in the tour: a spot, the drone scene/map or one of its points. */
export const isInTourHref = (href: string) => isPlaceHref(href) || href === "#luften" || pointOfHref(href) != null;

/** The link to a spot in this tour. */
export function placeHref(T: Pick<TourConfig, "tourPage" | "modelId">, ss: number | string, rot?: { x: number; y: number }): string {
  const url = new URL(T.tourPage ? T.tourPage.split("?")[0] : `https://my.matterport.com/show/?m=${T.modelId}`);
  url.searchParams.set("ss", String(ss));
  if (rot) url.searchParams.set("rot", `${rot.x.toFixed(1)},${rot.y.toFixed(1)}`);
  return url.toString();
}

/** The tour's colour filter as CSS (MPSkins' "Color filter"): 1 = unchanged for brightness/contrast/saturate. */
export function cssFilter(f: NonNullable<TourConfig["filter"]>): string {
  return `brightness(${f.brightness ?? 1}) contrast(${f.contrast ?? 1}) saturate(${f.saturate ?? 1}) grayscale(${f.grayscale ?? 0}) hue-rotate(${f.hue ?? 0}deg)`;
}

/** A name as it goes in an address: "Kunst & Kultur" → "kunst-kultur". */
export const placeSlug = (s: string) =>
  s.toLowerCase().replace(/æ/g, "ae").replace(/ø/g, "oe").replace(/å/g, "aa").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export type StartPlace = { key: string; name: string; group: string | null; href: string };

/**
 * The places a tour can be started in from a link (`?rum=<key>`) - every place
 * in the menu. The key is the name; when two places share a name (e.g.
 * "Toilet og bad" in two wings) it's "group--name", so each has its own.
 */
export function startPlaces(T: Pick<TourConfig, "menu">): StartPlace[] {
  const all = T.menu
    .flatMap((m): Omit<StartPlace, "key">[] => ("items" in m ? m.items.map(([name, href]) => ({ name, group: m.title, href })) : [{ name: m.title, group: null, href: m.href }]))
    .filter((p) => isPlaceHref(p.href));
  return all.map((p) => {
    const twins = all.filter((x) => placeSlug(x.name) === placeSlug(p.name)).length > 1;
    return { ...p, key: twins && p.group ? `${placeSlug(p.group)}--${placeSlug(p.name)}` : placeSlug(p.name) };
  });
}

/**
 * A Danish phone number written the usual way: "+45 75 17 38 33" (or
 * "75 17 38 33" without the country code). Anything that isn't a Danish
 * 8-digit number is left as it is.
 */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  const m = /^(?:(\+45|0045))?(\d{8})$/.exec(digits);
  if (!m) return phone.trim();
  const n = m[2].replace(/(\d{2})(?=\d)/g, "$1 ");
  return m[1] ? `+45 ${n}` : n;
}
