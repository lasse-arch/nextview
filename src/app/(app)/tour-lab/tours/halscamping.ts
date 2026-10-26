import type { TourConfig } from "./types";
import { halscampingTranslations } from "./halscamping-sprog";

/**
 * Hals Strand Camping - a campsite that starts in the air: the drone 360°
 * (moved over from the Lovable map) is the tour's front page, and the menu
 * and points move the visitor around. Matterport is only used where we have
 * scanned (the cabin, the service building, the pool's kitchen and changing
 * room) - the scans lie far apart, so nobody starts or walks between them in
 * Matterport. The pool, playground, minigolf and beach are shown with the
 * customer's own summer photos and 360° photos (the drone flew in October),
 * and the pitch types are points with a photo and a book button - no single
 * pitch has to be filmed. New facilities scanned next summer become a `tour`
 * on their point.
 */

const MODEL = "u1wsN6exqPh";
const m = (ss: number, sr: string) => `https://my.matterport.com/show/?m=${MODEL}&ss=${ss}&sr=${sr}`;
const BOOK = "https://v3.onlinebooking.dk/v3halscamp";
const SITE = "https://www.halsstrandcamping.dk";
const img = (name: string) => `/tours/halscamping/img/${name}.webp`;

export const halscamping: TourConfig = {
  slug: "halscamping",
  brand: "Hals Strand Camping",
  title: "Hals Strand Camping",
  tourPage: "",
  modelId: MODEL,
  start: m(9, "-.02,.15"),
  logo: "/tours/halscamping/logo.png",
  favicon: "/tours/halscamping/favicon.png",
  subtitle: "Camping direkte ved stranden",
  colors: { main: "#135d7a", accent: "#e0702b", accentDark: "#c25b1d", soft: "#f6f2e8" },
  font: "Nunito",
  cta: [
    { label: "Book dit ophold", href: BOOK, primary: true },
    { label: "Se priser", href: `${SITE}/priser-mere-for-pengene/`, primary: false },
  ],
  linkOpen: { default: "tab", byUrl: { [BOOK]: "popup", "/tours/halscamping/pladskort.webp": "popup" } },
  contact: {
    address: "Lagunen 8, 9370 Hals",
    mapUrl: "https://www.google.com/maps/search/?api=1&query=Hals+Strand+Camping+Lagunen+8+9370+Hals",
    phone: "+45 51 24 35 07",
    email: "info@halsstrandcamping.dk",
    social: { facebook: "https://www.facebook.com/HalsStrandCamping/" },
  },
  /** The drone 360° over the entrance and the pool (Pannellum multires tiles, moved over from the Lovable map). */
  drone: {
    basePath: "/tours/halscamping/drone",
    maxLevel: 4,
    cubeResolution: 4096,
    start: { yaw: -60, pitch: -30, hfov: 105 },
    startMobile: { yaw: -55, pitch: -37, hfov: 74 },
    intro: { title: "Velkommen til Hals Strand Camping", lead: "Direkte ved den børnevenlige sandstrand i Nordjylland. Tryk på et sted, og se det med egne øjne." },
    backLabel: "Pladsen fra luften",
    filterTitle: "Hvad leder I efter?",
  },
  /** 360° photos: two more drone views (B: towards the beach, D: the middle of the site) and low drone shots of the Aqua-Park, playground and minigolf. */
  panos: { basePath: "/tours/halscamping/panos", maxLevel: 3, cubeResolution: 2048 },
  categories: {
    aktiv: { name: "Leg og badeland", color: "#e0702b" },
    bo: { name: "Pladser og hytter", color: "#8a5a2a" },
    facil: { name: "Faciliteter", color: "#135d7a" },
    natur: { name: "Strand og natur", color: "#2b8fc7" },
  },
  points: [
    { id: "pool", name: "Aqua-Park", cat: "aktiv", icon: "svoem", yaw: -37.4, pitch: -39.1, size: 1.3, tour: null, pano: "badeland", panoStart: { yaw: 80, pitch: -22 },
      images: [img("pool-1"), img("pool-2"), img("pool-3"), img("pool-4")],
      text: "Opvarmet udendørs badeland med tre bassiner, en gigantisk surf hill-rutsjebane, vandkanoner og boblezone. De mindste har deres eget bassin med fyrtårn og rutsjebane.",
      chips: ["3 opvarmede bassiner", "Surf hill", "Gratis for overnattende gæster"] },
    { id: "legeplads", name: "Legeplads og klappegeder", cat: "aktiv", icon: "legeplads", yaw: -18.4, pitch: -63.8, tour: null, pano: "legeplads", panoStart: { yaw: -12, pitch: -25 },
      images: [img("leg-1"), img("leg-2"), img("leg-3")],
      text: "To store hoppepuder, klatrevægge og masser af nye legekammerater. Og klappegederne, som børnene gerne må fodre.",
      chips: ["2 hoppepuder", "Klappegeder", "Fodboldbane"] },
    { id: "minigolf", name: "Adventure minigolf", cat: "aktiv", icon: "golf", yaw: 118.1, pitch: -57.4, tour: null, pano: "minigolf", panoStart: { yaw: 0, pitch: -32 },
      images: [img("golf-1"), img("golf-2"), img("golf-3")],
      text: "12 huller på kunstgræs med sten, vand og sandbunkere, næsten som en rigtig golfbane. En runde tager 30-40 minutter for fire personer.",
      chips: ["12 huller", "Par 43", "Køller 45 kr. i receptionen"] },
    { id: "strand", name: "Stranden", cat: "natur", icon: "strand", yaw: -93.6, pitch: 3.3, size: 1.2, tour: null, pano: "B", panoStart: { yaw: 0, pitch: -20 },
      images: [img("strand-1"), img("strand-2"), img("strand-3")],
      text: "Pladsen ligger direkte ud til en kridhvid, bilfri sandstrand med lavt vand og små bølger. Den er flere gange nomineret som Nordjyllands mest børnevenlige.",
      chips: ["Direkte adgang", "Børnevenlig", "Bilfri"] },
    { id: "havkig", name: "Pladser med havkig", cat: "bo", icon: "strand", yaw: -96, pitch: -9, tour: null, pano: "B", panoStart: { yaw: 30, pitch: -24 },
      images: [img("zone-havkig"), img("plads-1")],
      text: "Mange af pladsens 400 pladser har udsigt over Kattegat. Her vågner I til havet og har få skridt til stranden.",
      chips: ["Udsigt over Kattegat", "Tæt på stranden", "Strøm på alle pladser"],
      button: { label: "Book din plads", href: BOOK } },
    { id: "komfort", name: "Komfortpladser", cat: "bo", icon: "stik", yaw: -104.2, pitch: -6.7, tour: null,
      images: [img("zone-komfort")],
      text: "Vores største pladser på 150 m² med strøm, egen vandhane og afløb på pladsen. De gule pladser på pladskortet.",
      chips: ["150 m²", "Vand og afløb", "Strøm"],
      button: { label: "Book din plads", href: BOOK } },
    { id: "deluxeplus", name: "Deluxe og Deluxe Plus", cat: "bo", icon: "stjerne", yaw: -71.5, pitch: -53.6, tour: null,
      images: [img("zone-aktiv")],
      text: "Pladserne med den mest populære beliggenhed: tæt på stranden, legepladsen eller servicebygningerne, ofte med høje hække omkring. Blå og lilla på pladskortet.",
      chips: ["Populær beliggenhed", "Ekstra plads", "Strøm"],
      button: { label: "Book din plads", href: BOOK } },
    { id: "standard", name: "Standardpladser", cat: "bo", icon: "plads", yaw: -91.4, pitch: -17.6, tour: null, pano: "D", panoStart: { yaw: 0, pitch: -28 },
      images: [img("plads-1")],
      text: "Den klassiske campingplads på ca. 100 m² til telt, vogn eller autocamper, spredt over hele pladsen. De grønne pladser på pladskortet.",
      chips: ["Ca. 100 m²", "Strøm"],
      button: { label: "Book din plads", href: BOOK } },
    { id: "telt", name: "Teltpladser", cat: "bo", icon: "telt", yaw: -100.9, pitch: -16.1, tour: null,
      images: [img("zone-telt")],
      text: "Lune, grønne pladser på ca. 100 m², hvor man bor sammen med andre teltgæster, med kort vej til bad, køkken og legeplads.",
      chips: ["Ca. 100 m²", "Strøm"],
      button: { label: "Book din plads", href: BOOK } },
    { id: "autocamper", name: "Autocamperpladser", cat: "bo", icon: "autocamper", yaw: -60.9, pitch: -7, tour: null,
      images: [img("autocamper-1"), img("autocamper-2"), img("zone-auto")],
      text: "Tryg overnatning inden for bom, tømning og vandpåfyldning. Kommer I uden for receptionens åbningstid, tjekker I selv ind ved standeren kl. 7-23.",
      chips: ["Selvbetjent check-in", "Tømning og vand", "Stellplatz fra 120 kr."],
      button: { label: "Book din plads", href: BOOK } },
    { id: "hytter", name: "Hytterne", cat: "bo", icon: "hus", yaw: 50, pitch: -55.5, size: 1.2, tour: m(9, "-.02,.15"),
      images: [img("hytte-1"), img("hytte-2"), img("hytte-3"), img("zone-hytter")],
      text: "Nye hytter på 35 m² til 6 personer med 3 soveværelser, bad og toilet, køkken og stor stue. Gratis WiFi og adgang til badelandet.",
      chips: ["6 personer", "3 soveværelser", "Fra 700 kr./døgn"],
      button: { label: "Book en hytte", href: BOOK } },
    { id: "familiekoekken", name: "Familiekøkkenet", cat: "facil", icon: "koekken", yaw: -85.6, pitch: -10.8, tour: m(27, "-.12,1.29"),
      images: [img("familiekoekken")],
      text: "Det nye familiekøkken med kogeplader og kombinationsovne. Varmt vand er gratis for overnattende gæster.",
      chips: ["Kogeplader", "Kombiovne", "Gratis varmt vand"] },
    { id: "familiebad", name: "Familiebaderummene", cat: "facil", icon: "bad", yaw: -76, pitch: -11.9, tour: m(38, "-.07,.07"),
      images: [img("familiebad")],
      text: "10 nye familiebaderum, så hele familien kan gøre sig klar sammen. Bad og varmt vand er med i prisen.",
      chips: ["10 familiebaderum", "Gratis bad"] },
    { id: "poolkoekken", name: "Køkkenet ved poolen", cat: "facil", icon: "koekken", yaw: -30.1, pitch: -27.9, tour: m(11, "-.01,.15"),
      images: [img("poolkoekken")],
      text: "Campingkøkkenet lige ved badelandet og solterrassen.",
      chips: ["Ved badelandet"] },
    { id: "reception", name: "Reception og butik", cat: "facil", icon: "info", yaw: -172.3, pitch: -58.1, tour: null,
      images: [img("reception-1"), img("reception-2")],
      text: "Her tjekker I ind, lejer minigolfkøller og køber dagligvarer, is og nybagt morgenbrød. Standeren til selvbetjent check-in står lige foran.",
      chips: ["Nybagt morgenbrød", "Butik", "Check-in kl. 7-23"] },
  ],
  welcome: {
    kicker: "Hals Strand Camping",
    title: "Ferie direkte ved stranden",
    lead: "Se pladsen fra luften, find den plads der passer til jer, og kig ind i hytterne og de nye baderum. Hvor vil I starte?",
    tiles: [
      { kicker: "Overblik", title: "Pladsen fra luften", go: { drone: null }, style: "dark", recommended: true, image: img("luft-pool") },
      { kicker: "Til børnene", title: "Aqua-Park og leg", go: { drone: "aktiv" }, style: "light", image: img("pool-3") },
      { kicker: "Find jeres plads", title: "Pladser og hytter", go: { drone: "bo" }, style: "light", image: img("zone-havkig") },
      { kicker: "Bo i hytte", title: "Se hytten indefra", go: { room: m(9, "-.02,.15"), name: "Hytten indefra" }, style: "light", image: img("hytte-1") },
      { kicker: "Næste skridt", title: "Book dit ophold", go: { href: BOOK }, style: "accent" },
    ],
    skip: "Vi kigger selv rundt",
  },
  navigation: "free",
  hiddenSweeps: [],
  menuOpenOnStart: { desktop: false, mobile: false },
  /** The scans lie up to 200 m apart - a calm cross-fade instead of flying over the site. */
  jump: "fade",
  placeCards: [
    { ss: [9], title: "Hytten", text: "35 m² med 3 soveværelser, bad og toilet, køkken og stor stue. Plads til 6, og dyner og puder er der.", buttons: [{ label: "Book en hytte", href: BOOK }] },
    { ss: [38], title: "Familiebaderummene", text: "10 nye familiebaderum. Bad og varmt vand er med i prisen, når I overnatter på pladsen." },
  ],
  nudge: {
    afterSeconds: 80,
    title: "Har I fundet jeres plads?",
    text: "Book jeres ophold direkte online, eller ring til os på 51 24 35 07, hvis I har spørgsmål.",
    buttons: [
      { label: "Book dit ophold", href: BOOK, primary: true },
      { label: "Se priser", href: `${SITE}/priser-mere-for-pengene/` },
    ],
  },
  mobileZoomLock: true,
  guide: {
    stops: [
      { point: "pool" },
      { point: "legeplads" },
      { point: "minigolf" },
      { point: "strand" },
      { point: "familiebad" },
      { point: "hytter" },
      { href: "", title: "Vi glæder os til at se jer", text: "Book jeres ophold direkte online, eller ring på 51 24 35 07, hvis I har spørgsmål." },
    ],
  },
  menu: [
    { title: "Pladsen fra luften", href: "#luften" },
    { title: "Til hele familien", items: [["Aqua-Park", "#punkt:pool"], ["Legeplads og klappegeder", "#punkt:legeplads"], ["Adventure minigolf", "#punkt:minigolf"], ["Stranden", "#punkt:strand"]] },
    { title: "Find jeres plads", items: [["Pladser med havkig", "#punkt:havkig"], ["Komfortpladser", "#punkt:komfort"], ["Deluxe og Deluxe Plus", "#punkt:deluxeplus"], ["Standardpladser", "#punkt:standard"], ["Teltpladser", "#punkt:telt"], ["Autocamperpladser", "#punkt:autocamper"], ["Pladskortet", "/tours/halscamping/pladskort.webp"]] },
    { title: "Bo i hytte", items: [["Hytten indefra", m(9, "-.02,.15")], ["Om hytterne", "#punkt:hytter"]] },
    { title: "Faciliteter", items: [["Familiekøkkenet", m(27, "-.12,1.29")], ["Familiebaderummene", m(38, "-.07,.07")], ["Køkkenet ved poolen", m(11, "-.01,.15")], ["Omklædning ved poolen", m(24, "-2.97,-.47")], ["Reception og butik", "#punkt:reception"]] },
    { title: "Praktisk", items: [["Priser", `${SITE}/priser-mere-for-pengene/`], ["Tilbud", `${SITE}/tilbud/`], ["Åbningstider", `${SITE}/praktisk/aabningstider/`], ["Ankomst og afrejse", `${SITE}/ankomst-og-afrejse/`], ["Bliv fastligger", `${SITE}/fastligger/bliv-fastligger/`]] },
    { title: "Book dit ophold", href: BOOK },
  ],
  languages: ["en", "de"],
  translations: halscampingTranslations,
  matterportParams: { play: "1", qs: "1", help: "0", dh: "0", gt: "0", hr: "0", f: "0", fp: "0", vr: "0", title: "0", brand: "0", mls: "0", search: "0" },
  flyMs: 800,
};
