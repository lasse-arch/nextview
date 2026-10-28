import type { DroneView, TourConfig } from "./types";

/*
 * A spot in the tour is a link with the scan point (ss) and, if picked in
 * the editor, the exact view (rot). It is either an MPSkins tour link
 * (explore.nextview360.dk/…?ss=) or - for tours connected straight to a
 * Matterport model - Matterport's own (my.matterport.com/show/?m=…&ss=).
 * Anything else is a page out of the tour.
 */

/** A menu item (or any link) that shows a picture in the tour: "#billede:" + its address - a 2:1 picture opens as 360°. */
export const IMAGE_HREF = "#billede:";
export const imageOfHref = (href: string) => (href.startsWith(IMAGE_HREF) ? href.slice(IMAGE_HREF.length) || null : null);
export const isPlaceHref = (href: string) => /explore\.nextview360\.dk|my\.matterport\.com\/show/.test(href);

/** The point id of a "#punkt:<id>" link (a point on the drone scene or map), else null. */
export const pointOfHref = (href: string) => (href.startsWith("#punkt:") ? href.slice(7) : null);

/**
 * "#luften": back to the drone scene / map - turned to a spot of its own, if
 * one was picked in the editor, per device: "#luften?d=yaw,pitch,hfov&m=…".
 */
export type DroneViews = { desktop?: DroneView; mobile?: DroneView };
export const isDroneHref = (href: string) => href === "#luften" || href.startsWith("#luften?");
export function droneViewsOfHref(href: string): DroneViews {
  if (!href.startsWith("#luften?")) return {};
  const q = new URLSearchParams(href.slice(8));
  const read = (s: string | null): DroneView | undefined => {
    const [yaw, pitch, hfov] = (s ?? "").split(",").map(Number);
    return [yaw, pitch, hfov].every(Number.isFinite) && hfov > 0 ? { yaw, pitch, hfov } : undefined;
  };
  return { desktop: read(q.get("d")), mobile: read(q.get("m")) };
}
export function droneHref(v: DroneViews): string {
  const put = (x: DroneView) => [x.yaw, x.pitch, x.hfov].map((n) => Math.round(n * 10) / 10).join(",");
  const q = [v.desktop && `d=${put(v.desktop)}`, v.mobile && `m=${put(v.mobile)}`].filter(Boolean).join("&");
  return q ? `#luften?${q}` : "#luften";
}

/** A link that stays in the tour: a spot, the drone scene/map or one of its points. */
export const isInTourHref = (href: string) => isPlaceHref(href) || isDroneHref(href) || href === "#plan" || pointOfHref(href) != null;

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

/** A 360° picture's view width (degrees) per device at zoom 1: a computer a little zoomed out, a phone a little zoomed in. */
export const PANO_HFOV = { desktop: 110, mobile: 80 } as const;
/** The view width for a zoom (1 = the device's normal; over 1 is closer). */
export const panoHfov = (phone: boolean, zoom = 1) => Math.max(30, Math.min(120, (phone ? PANO_HFOV.mobile : PANO_HFOV.desktop) / (zoom || 1)));

/**
 * What the guide's stop button does: its own setting - else back to the
 * aerial photo when the guide only shows points on it (nothing to walk around
 * in), else "Gå selv rundt".
 */
export function guideExit(T: TourConfig): "self" | "overview" {
  if (T.guide?.exit) return T.guide.exit;
  const stops = T.guide?.stops ?? [];
  const onlyPoints = !T.guide?.fromMenu && stops.length > 0 && stops.every((s) => "point" in s || !s.href);
  return onlyPoints && (T.drone || T.map) ? "overview" : "self";
}
