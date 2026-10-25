import { halvorsminde } from "./halvorsminde";
import type { TourConfig } from "./types";

/**
 * Halvorsminde starting on a flat map instead of the 360° drone scene - the
 * prototype for campsites and others that only have a site plan or an
 * illustrated map (until the spring drone flight). Everything else is the
 * same tour. The picture is a flat render of the drone photo; an illustrated
 * map drops in the same way (new image, points placed again).
 */
export const halvorsmindeKort: TourConfig = {
  ...halvorsminde,
  slug: "halvorsminde-kort",
  map: {
    image: "/tours/halvorsminde/kort/kort.jpg",
    w: 2600,
    h: 1600,
    // Where each drone point lands on the picture (x, y in %); the shelter is outside it.
    spots: {
      vaerelse2: [54.26, 40.33],
      vaerelse3: [80.68, 53.13],
      vaerelse4: [46.36, 53.63],
      faellesrum: [52.62, 61.44],
      foredrag: [46.62, 64.54],
      metal: [92.81, 67.3],
      sloejd: [87.23, 74.87],
      styling: [71.03, 55.25],
      gastro: [56.22, 67.02],
      hal: [19.74, 55.17],
      fitness: [33.87, 67.95],
      fodbold: [63.09, 25.78],
      skov: [65.53, 33.71],
      sauna: [33.1, 49.0],
      volleyball: [37.54, 33.96],
    },
    start: { x: 52, y: 50, zoom: 1 },
    startMobile: { x: 54, y: 52, zoom: 1 },
    searchPlaceholder: "Søg fx værelse, hal, sløjd…",
  },
};
