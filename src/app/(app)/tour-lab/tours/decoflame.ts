import type { TourConfig } from "./types";

/**
 * Third prototype tour: a showroom that opens with a film - the drone flies
 * down to the entrance, and the tour takes over right there with a welcome
 * where you pick what to see. Built on the current Decoflame tour (its scan
 * points and menu), not a copy of it.
 */
const TOUR = "https://explore.nextview360.dk/tour/decoflame";
const u = (ss: number, sr: string) => `${TOUR}?ss=${ss}&sr=${sr}`;
const SITE = "https://www.decoflame.com";

export const decoflame: TourConfig = {
  slug: "decoflame",
  brand: "Decoflame",
  title: "Decoflame showroom",
  tourPage: TOUR,
  start: u(30, "-.18,.9"),
  logo: "/tours/decoflame/logo.png",
  logoOnLight: true,
  subtitle: "Biopejse & hybridpejse",
  colors: { main: "#1f1f1f", accent: "#b5562a", accentDark: "#8f3f1b", soft: "#f5f3ef" },
  font: "Montserrat",
  cta: [
    { label: "Book et besøg i showroomet", href: `${SITE}/showroom`, primary: true },
    { label: "Find forhandler", href: `${SITE}/find-retailer`, primary: false },
  ],
  contact: { email: "info@decoflame.dk" },
  intro: {
    sources: [
      { src: "/tours/decoflame/intro-mobil.webm", type: "video/webm", media: "(max-width: 760px)" },
      { src: "/tours/decoflame/intro-mobil.mp4", type: "video/mp4", media: "(max-width: 760px)" },
      { src: "/tours/decoflame/intro.webm", type: "video/webm" },
      { src: "/tours/decoflame/intro.mp4", type: "video/mp4" },
    ],
    poster: "/tours/decoflame/intro-poster.jpg",
  },
  welcome: {
    kicker: "Showroom",
    title: "Velkommen til Decoflame",
    lead: "Gå rundt i showroomet og se pejsene i virkeligheden - eller hop direkte til den type, du drømmer om.",
    tiles: [
      { kicker: "Til væggen", title: "Biopejse til indbygning", go: { room: u(37, "-.19,-1.17"), name: "Biopejse til indbygning" }, style: "dark", recommended: true },
      { kicker: "Midt i rummet", title: "Fritstående", go: { room: u(58, "-2.55,-.96"), name: "Fritstående" }, style: "light" },
      { kicker: "Et blikfang", title: "Lofthængte", go: { room: u(47, "-2.86,-1.13"), name: "Lofthængte" }, style: "light" },
      { kicker: "Bag kulisserne", title: "Se produktionen", go: { room: u(8, "-.01,.25"), name: "Produktionen" }, style: "light" },
      { kicker: "Næste skridt", title: "Book et besøg", go: { href: `${SITE}/showroom` }, style: "accent" },
    ],
    skip: "Jeg kigger selv rundt",
  },
  categories: {},
  points: [],
  navigation: "free",
  hiddenSweeps: [],
  menuOpenOnStart: { desktop: false, mobile: false },
  stories: { mobile: true, desktop: false },
  menu: [
    { title: "Velkommen til Decoflame", href: u(30, "-.18,.9") },
    {
      title: "Showroomet",
      items: [
        ["Biopejse til indbygning", u(37, "-.19,-1.17")],
        ["Væghængte", u(44, "-.16,.83")],
        ["Fritstående", u(58, "-2.55,-.96")],
        ["Lofthængte", u(47, "-2.86,-1.13")],
        ["Rumdelere", u(25, "-3.09,-.61")],
        ["Pejsevægge", u(60, "-.15,-.77")],
        ["Specialmodeller", u(57, "-.16,.47")],
        ["Udendørs og bordmodeller", u(34, "-.68,.9")],
      ],
    },
    { title: "Bag kulisserne", items: [["Produktionen", u(8, "-.01,.25")], ["Værkstedet", u(10, "-3.01,-.63")]] },
  ],
  matterportParams: { play: "1", qs: "1", help: "0", title: "0", brand: "0", mls: "0", search: "0", vr: "0", dh: "0", gt: "0", f: "0" },
  flyMs: 800,
};
