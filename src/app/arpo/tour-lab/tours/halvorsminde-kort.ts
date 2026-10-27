import { halvorsminde } from "./halvorsminde";
import type { TourConfig } from "./types";

/**
 * Halvorsminde starting on a flat map instead of the 360° drone scene - the
 * prototype for campsites and others that only have a site plan or an
 * illustrated map (until the spring drone flight). Everything else is the
 * same tour. The points are placed and edited in the editor (Interaktivt kort).
 */
export const halvorsmindeKort: TourConfig = {
  ...halvorsminde,
  slug: "halvorsminde-kort",
  title: "Halvorsminde - på tegnet kort",
  map: {
    // The illustrated map (2026), drawn for Nextview360 - the points sit on the buildings they open.
    image: "/tours/halvorsminde/kort/kort-2026.jpg",
    w: 4000,
    h: 1995,
    spots: {
      hal: [17, 41],
      fitness: [27, 51],
      foredrag: [36, 50],
      faellesrum: [43, 43],
      gastro: [42, 49],
      vaerelse4: [30, 37.5],
      sauna: [21.5, 36],
      vaerelse2: [41, 29],
      volleyball: [31.5, 15.5],
      styling: [49, 29],
      vaerelse3: [54, 33],
      sloejd: [57, 42],
      metal: [63, 41],
      fodbold: [37.5, 5],
      skov: [45, 12.5],
    },
    start: { x: 42, y: 40, zoom: 1.1 },
    startMobile: { x: 38, y: 42, zoom: 1.4 },
    searchPlaceholder: "Søg fx værelse, hal, sløjd…",
  },
};
