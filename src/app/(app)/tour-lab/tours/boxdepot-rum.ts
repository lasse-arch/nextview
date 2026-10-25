import { boxdepot } from "./boxdepot";
import type { TourConfig } from "./types";

/**
 * Boxdepotet's second tour on the same scanning: only the storage rooms, no
 * walking - you switch between sizes and contents in the room picker, flying
 * straight to the room like the full tour's menu. All other scan points stay
 * hidden (as set in MPSkins).
 */
const TOUR = "https://explore.nextview360.dk/tour/6pc9z8q6px";
const u = (ss: number, sr: string) => `${TOUR}?ss=${ss}&sr=${sr}`;

export const boxdepotRum: TourConfig = {
  ...boxdepot,
  slug: "boxdepot-rum",
  title: "Boxdepotet Horsens - rumstørrelser",
  tourPage: "https://explore.nextview360.dk/da/tour/6pc9z8q6px",
  start: u(231, "-1.48,1.25"),
  design: { welcome: "tiles", menu: "picker" },
  navigation: "points",
  // No dollhouse or floor plan - nothing to jump out of the rooms with.
  matterportParams: { ...boxdepot.matterportParams, dh: "0", gt: "0", f: "0", fp: "0" },
  wayfinding: undefined,
  // Available rooms live from Boxdepotet's own price page, per size in the picker.
  availability: {
    source: "boxdepotet",
    url: "https://boxdepotet.dk/priser-booking/horsens-odder/",
    ranges: {
      "Depotrum: 5 m³": [0, 10.5],
      "Depotrum: 14 m³": [10.5, 15],
      "Depotrum: 17 m³": [15, 20],
      "Depotrum: 29 m³": [20, 30],
      "Depotrum: 33 m³": [30, 1000],
    },
  },
  menu: [
    { title: "Depotrum: 5 m³", items: [["Tomt", u(231, "-1.48,1.25")], ["Med flyttekasser", u(232, "-1.58,1.27")], ["Med flyttekasser og dæk", u(233, "-1.54,1.13")]] },
    { title: "Depotrum: 14 m³", items: [["Tomt", u(235, "-.83,-1.08")], ["Med flyttekasser", u(237, "-.85,-1.04")], ["Med flyttekasser, dæk og møbler", u(238, "-1.06,-.99")]] },
    { title: "Depotrum: 17 m³", items: [["Tomt", u(208, "-1.71,1.14")], ["Med flyttekasser, dæk og møbler", u(193, "-1.88,1.19")]] },
    { title: "Depotrum: 29 m³", items: [["Tomt", u(230, "-.58,.77")], ["Med flyttekasser", u(229, "-.48,.65")], ["Med flyttekasser, dæk og møbler", u(228, "-.38,.68")]] },
    { title: "Depotrum: 33 m³", items: [["Tomt", u(204, "-.17,.26")], ["Med flyttekasser", u(205, "-.19,.34")]] },
  ],
};
