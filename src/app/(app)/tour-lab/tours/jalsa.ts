import type { TourConfig } from "./types";

/**
 * Restaurant prototype: the "cover" welcome and the "dock" menu. The places
 * are the model's own Matterport photos, each linked to the scan point it was
 * taken from - so "Træd indenfor" continues from the cover photo into that
 * view, and every place card lands where its photo is.
 *
 * The view directions are not the photos' own camera data (that turned out to
 * point the wrong way): each photo was matched against its scan point's 360°
 * image to find the direction it really shows.
 */
const TOUR = "https://explore.nextview360.dk/tour/jalsaaalborg";
/** An exact view, copied in the tour with "Kopiér dette udsyn": scan point, pitch and yaw in degrees. */
const v = (ss: number, pitch: number, yaw: number) => `${TOUR}?ss=${ss}&rot=${pitch},${yaw}`;
const BOOK = "https://book.easytable.com/book/?id=4cd78&lang=da";
const ORDER = "https://order.site/jalsa-indisk-restaurant-aalborg/da/dnk";
const P = "/tours/jalsa";

export const jalsa: TourConfig = {
  slug: "jalsa",
  brand: "Jalsa",
  title: "Jalsa Indisk Restaurant Aalborg",
  tourPage: "https://explore.nextview360.dk/da/tour/318freb4af",
  start: v(2, 0, 0),
  logo: `${P}/logo.png`,
  logoSize: 72,
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
  // Booking and the menu card open over the tour, so the guest never leaves it. (Sites that can't be shown that way open in a new tab by themselves.)
  linkOpen: { default: "popup" },
  guide: {
    seconds: 8,
    stops: [
      { href: v(13, 0, -107.7), title: "Velkommen indenfor", text: "Her starter aftenen hos Jalsa - lige inden for døren på Ved Stranden." },
      { href: v(2, 0, 0), title: "Restauranten", text: "Hovedsalen med de varme lamper. Plads til både to og til hele selskabet." },
      { href: v(4, 0, -163.9), title: "Loungen", text: "Sofaerne og væggen med kunst - til dem, der vil sidde lidt mere afslappet." },
      { href: v(6, 0, 17.8), title: "Baren", text: "Den røde væg og baren. Kig forbi til en drink før maden." },
      { href: v(15, 0, 80.2), title: "Vinduesbordene", text: "Bordene ved vinduerne ud mod Ved Stranden. Fundet dit bord? Book det med det samme." },
    ],
  },
  places: [
    { name: "Restauranten", kicker: "Hovedsalen", href: v(2, 0, 0), image: `${P}/restauranten.jpg` },
    { name: "Loungen", kicker: "Sofaer og kunst", href: v(4, 0, -163.9), image: `${P}/loungen.jpg` },
    { name: "Baren", kicker: "Den røde væg", href: v(6, 0, 17.8), image: `${P}/baren.jpg` },
    { name: "Vinduesbordene", kicker: "Ud mod Ved Stranden", href: v(15, 0, 80.2), image: `${P}/vinduesbordene.jpg` },
    { name: "Indgangen", kicker: "Velkommen", href: v(13, 0, -107.7), image: `${P}/indgangen.jpg` },
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
