import type { TourConfig } from "./types";

/**
 * Boxdepotet Horsens: "Find vej" - pick a storage room (or a box number) and
 * the tour walks you there from wherever you stand, scan point by scan point,
 * the way you'd walk it in the building. Built on the current tour's menu.
 */
const TOUR = "https://explore.nextview360.dk/tour/d1xdm9bgzk";
const u = (ss: number, sr: string) => `${TOUR}?ss=${ss}&sr=${sr}`;
/** Just the scan point, facing the way you walked in. */
const at = (ss: number) => `${TOUR}?ss=${ss}`;
const BOOK = "https://boxdepotet.dk/priser-booking/horsens-odder/";

export const boxdepot: TourConfig = {
  slug: "boxdepot",
  brand: "Boxdepotet",
  title: "Boxdepotet Horsens",
  tourPage: "https://explore.nextview360.dk/da/tour/d1xdm9bgzk",
  start: u(3, "-2.24,-1.32"),
  logo: "/tours/boxdepot/logo.svg",
  logoOnLight: true,
  logoSize: 56,
  subtitle: "Depotrum i Horsens",
  colors: { main: "#3a3a3a", accent: "#478647", accentDark: "#356935", soft: "#f3f5f2" },
  font: "Barlow",
  cta: [{ label: "Se priser og book", href: BOOK, primary: true }],
  linkOpen: { default: "popup" },
  categories: {},
  points: [],
  navigation: "free",
  hiddenSweeps: [],
  menuOpenOnStart: { desktop: true, mobile: false },
  wayfinding: {
    // Box numbers read off the door labels in the tour's own 360° images (a first sample - the
    // full list comes from running the reading over every scan point).
    boxes: { "121": at(234), "124": at(234), "125": at(234), "126": at(234), "160": at(231) },
  },
  menu: [
    { title: "Af- og pålæsning m.m.", items: [["Ankomstområde", u(239, "-3.01,-1.02")], ["Af- og pålæsning", u(4, "-.22,-.98")], ["Elevator", u(174, "-.18,.78")]] },
    { title: "Depotrum: 5 m³", items: [["Tomt", u(231, "-1.48,1.25")], ["Med flyttekasser", u(232, "-1.58,1.27")], ["Med flyttekasser og dæk", u(233, "-1.54,1.13")]] },
    { title: "Depotrum: 14 m³", items: [["Tomt", u(235, "-.83,-1.08")], ["Med flyttekasser", u(237, "-.85,-1.04")], ["Med flyttekasser, dæk og møbler", u(238, "-1.06,-.99")]] },
    { title: "Depotrum: 17 m³", items: [["Tomt", u(208, "-1.71,1.14")], ["Med flyttekasser, dæk og møbler", u(193, "-1.88,1.19")]] },
    { title: "Depotrum: 29 m³", items: [["Tomt", u(230, "-.58,.77")], ["Med flyttekasser", u(229, "-.48,.65")], ["Med flyttekasser, dæk og møbler", u(228, "-.38,.68")]] },
    { title: "Depotrum: 33 m³", items: [["Tomt", u(204, "-.17,.26")], ["Med flyttekasser", u(205, "-.19,.34")]] },
  ],
  matterportParams: { play: "1", qs: "1", help: "0", title: "0", brand: "0", mls: "0", search: "0", vr: "0" },
  flyMs: 800,
};
