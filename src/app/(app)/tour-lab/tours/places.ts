import type { TourConfig } from "./types";

/*
 * A spot in the tour is a link with the scan point (ss) and, if picked in
 * the editor, the exact view (rot). It is either an MPSkins tour link
 * (explore.nextview360.dk/…?ss=) or - for tours connected straight to a
 * Matterport model - Matterport's own (my.matterport.com/show/?m=…&ss=).
 * Anything else is a page out of the tour.
 */

export const isPlaceHref = (href: string) => /explore\.nextview360\.dk|my\.matterport\.com\/show/.test(href);

/** The link to a spot in this tour. */
export function placeHref(T: Pick<TourConfig, "tourPage" | "modelId">, ss: number | string, rot?: { x: number; y: number }): string {
  const url = new URL(T.tourPage ? T.tourPage.split("?")[0] : `https://my.matterport.com/show/?m=${T.modelId}`);
  url.searchParams.set("ss", String(ss));
  if (rot) url.searchParams.set("rot", `${rot.x.toFixed(1)},${rot.y.toFixed(1)}`);
  return url.toString();
}
