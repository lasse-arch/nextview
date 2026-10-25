import type { TourConfig } from "./types";

/**
 * Restaurant prototype: the "cover" welcome and the "dock" menu. The places
 * are the model's own Matterport photos, each linked to the scan point and
 * view it was taken from - so "Træd indenfor" continues from the cover photo
 * into exactly that view, and every place card lands where its photo is.
 */
const TOUR = "https://explore.nextview360.dk/tour/jalsaaalborg";
const u = (ss: number, sr: string) => `${TOUR}?ss=${ss}&sr=${sr}`;
const BOOK = "https://book.easytable.com/book/?id=4cd78&lang=da";
const ORDER = "https://order.site/jalsa-indisk-restaurant-aalborg/da/dnk";
const P = "/tours/jalsa";

export const jalsa: TourConfig = {
  slug: "jalsa",
  brand: "Jalsa",
  title: "Jalsa Indisk Restaurant Aalborg",
  tourPage: "https://explore.nextview360.dk/da/tour/318freb4af",
  start: u(2, "3.06,.40"),
  logo: `${P}/logo.png`,
  subtitle: "Authentic Indian Restaurant",
  colors: { main: "#120d08", accent: "#e0b96e", accentDark: "#c99c4a", soft: "#f6efe2" },
  font: "Jost",
  fontHeading: "Cormorant Garamond",
  cta: [
    { label: "Book bord", href: BOOK, primary: true },
    { label: "Bestil takeaway", href: ORDER, primary: false },
  ],
  contact: { address: "Ved Stranden 5, 9000 Aalborg", mapUrl: "https://maps.app.goo.gl/FCdXjxKVmkn2SRFy5", phone: "+45 75 75 75 84", email: "info@jalsa.dk" },
  design: { welcome: "cover", menu: "dock" },
  places: [
    { name: "Restauranten", kicker: "Hovedsalen", href: u(2, "3.06,.40"), image: `${P}/restauranten.jpg` },
    { name: "Loungen", kicker: "Sofaer og kunst", href: u(4, ".08,0"), image: `${P}/loungen.jpg` },
    { name: "Baren", kicker: "Den røde væg", href: u(6, "2.92,1.17"), image: `${P}/baren.jpg` },
    { name: "Vinduesbordene", kicker: "Ud mod Ved Stranden", href: u(15, ".11,.70"), image: `${P}/vinduesbordene.jpg` },
    { name: "Indgangen", kicker: "Velkommen", href: u(13, "3.00,-.92"), image: `${P}/indgangen.jpg` },
  ],
  cover: {
    kicker: "Indisk restaurant · Ved Stranden, Aalborg",
    title: "Velkommen til Jalsa",
    lead: "Kig indenfor før du kommer. Find det bord, du helst vil sidde ved - og book det med det samme.",
    image: `${P}/hero.jpg`,
    imageMobile: `${P}/hero-mobil.jpg`,
    enter: "Træd indenfor",
    placesTitle: "Vælg din plads",
  },
  dock: [
    { label: "Pladser", icon: "places", go: "places" },
    { label: "Menukort", icon: "menu", go: { href: "https://drive.google.com/file/d/12IbMWAmv1D8aunOw2syRllYGmWIdA3JA/view?usp=sharing" } },
    { label: "Book bord", icon: "book", go: { href: BOOK }, primary: true },
    { label: "Takeaway", icon: "order", go: { href: ORDER } },
    { label: "Find os", icon: "map", go: { href: "https://maps.app.goo.gl/FCdXjxKVmkn2SRFy5" } },
  ],
  categories: {},
  points: [],
  navigation: "free",
  hiddenSweeps: [],
  menuOpenOnStart: { desktop: false, mobile: false },
  menu: [],
  matterportParams: { play: "1", qs: "1", help: "0", title: "0", brand: "0", mls: "0", search: "0", vr: "0", dh: "0", gt: "0" },
  flyMs: 800,
};
