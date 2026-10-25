import { halvorsminde } from "./halvorsminde";
import type { TourConfig } from "./types";

/**
 * Halvorsminde starting on a flat map instead of the 360° drone scene - the
 * prototype for campsites and others that only have a site plan or an
 * illustrated map (until the spring drone flight). Everything else is the
 * same tour. kort.jpg next to it is a flat render of the drone photo, which
 * can be used the same way.
 */
export const halvorsmindeKort: TourConfig = {
  ...halvorsminde,
  slug: "halvorsminde-kort",
  map: {
    // The illustrated map; the points were placed building by building against the drone photo.
    image: "/tours/halvorsminde/kort/tegning.jpg",
    w: 2587,
    h: 1579,
    spots: {
      hal: [24, 53],
      fitness: [37, 62],
      foredrag: [44.5, 58],
      faellesrum: [52, 54],
      gastro: [51.5, 61.5],
      vaerelse4: [42, 48],
      sauna: [33, 42],
      vaerelse2: [51, 39],
      volleyball: [36, 31],
      styling: [59, 44],
      vaerelse3: [66, 41],
      sloejd: [70, 54],
      metal: [73.5, 48],
      fodbold: [25.5, 21],
      skov: [57, 26],
    },
    start: { x: 50, y: 50, zoom: 1 },
    startMobile: { x: 50, y: 47, zoom: 1.15 },
    searchPlaceholder: "Søg fx værelse, hal, sløjd…",
  },
};
