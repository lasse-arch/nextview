import type { TourConfig } from "./types";

/**
 * Second prototype tour: the "straight into the tour" kind - no drone
 * scene, no welcome, menu open on a computer from the start. Inspired by
 * the current Fitness United Grønlands Torv tour (its menu groups, and a
 * contact card in the menu), not a copy of it.
 */
const TOUR = "https://explore.nextview360.dk/tour/fitnessunitedgt";
const u = (ss: number, sr: string) => `${TOUR}?ss=${ss}&sr=${sr}`;

export const fitnessGronlandstorv: TourConfig = {
  slug: "fitness-gronlandstorv",
  brand: "Fitness United",
  title: "Fitness United Grønlands Torv",
  tourPage: TOUR,
  start: u(13, "3.12,.88"),
  logo: "/tours/fitness-gronlandstorv/logo.png",
  logoOnLight: true,
  subtitle: "Grønlands Torv, Aalborg",
  colors: { main: "#1b2526", accent: "#68c4c6", accentDark: "#3e9fa1", soft: "#eeeeea" },
  font: "Barlow",
  cta: [
    // Opens the memberships (Live data) inside the tour - each with its own "Vælg" to sign up.
    { label: "Bliv medlem - første måned halv pris", href: "#live", primary: true },
  ],
  /** The memberships and their prices, read off Fitness United's own sign-up page once a day. */
  live: {
    url: "https://fitnessunited.dk/bliv-medlem/aalborg-gronlands-torv",
    title: "Medlemskaber",
    kind: "priser",
    pattern: String.raw`\n[ \t]*(?<name>[^\n\[\]]{2,40}?)[ \t]*\nMEDLEMSKAB[ \t]*\n(?:[ \t]*(?<size>[^\n]*(?:pris|gratis|rabat)[^\n]*?)[ \t]*\n)?[\s\S]{0,300}?Normalpris\s+(?<price>[^\n]*?pr\. ?md\.)[\s\S]{0,1500}?\[Vælg\]\((?<link>[^)\s]+)\)`,
    flags: "i",
    bookLabel: "Vælg",
    refreshMinutes: 1440,
  },
  contact: {
    address: "Grønlands Torv, Aalborg",
    mapUrl: "https://www.google.com/maps/search/?api=1&query=Fitness+United+Aalborg+Gr%C3%B8nlands+Torv",
    email: "gronlandstorv@fitnessunited.dk",
    instagram: "https://www.instagram.com/fitness_united_gronlandstorv/",
  },
  categories: {},
  points: [],
  navigation: "free",
  hiddenSweeps: [],
  menuOpenOnStart: { desktop: true, mobile: false },
  stories: { mobile: true, desktop: true },
  menu: [
    { title: "Indgang og café", items: [["Reception", u(5, "-.03,-1.26")], ["Caféområde", u(13, "-.03,-1.2")], ["Salgsautomater", u(9, "-3.08,.52")]] },
    {
      title: "Træning",
      items: [
        ["Vægtstak-maskiner", u(37, "3.13,-.01")],
        ["Fitness United Wave", u(17, "-3.11,-.93")],
        ["Kabelmaskiner", u(40, "-3.1,-.02")],
        ["Kredsløbsudstyr", u(90, ".07,1.35")],
        ["Racks og funktionelt", u(74, "-3.13,1.04")],
        ["Plate loaded", u(65, "-.06,-.09")],
        ["Holdsal", u(59, "3.12,.74")],
      ],
    },
    { title: "Omklædning", items: [["Kvinder", u(103, "-2.15,1.5")], ["Mænd", u(100, "-3.07,-.17")]] },
  ],
  matterportParams: { play: "1", qs: "1", help: "0", title: "0", brand: "0", mls: "0", search: "0", vr: "0" },
  flyMs: 800,
};
