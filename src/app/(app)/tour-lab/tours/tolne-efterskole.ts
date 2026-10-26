import type { TourConfig } from "./types";

/**
 * Tolne Efterskole, moved over from its MPSkins tour: straight on the
 * Matterport model, with the same menu, the school's own orange, and the
 * voice tour ("Tag en rolig rundtur") where the visitor presses on themselves.
 * The voice files and the logo live with us (public/tours/tolne).
 */
const MODEL = "XHguBSNvBnU";
/** A spot in the model: scan point and view, as copied from the MPSkins menu. */
const u = (ss: number, sr: string) => `https://my.matterport.com/show/?m=${MODEL}&ss=${ss}&sr=${sr}`;
const P = "/tours/tolne";
const OPTAGET = "https://www.tolneefterskole.dk/bliv-optaget/";
const KONTAKT = "https://www.tolneefterskole.dk/kontakt/";

export const tolneEfterskole: TourConfig = {
  slug: "tolne-efterskole",
  brand: "Tolne Efterskole",
  title: "Tolne Efterskole",
  tourPage: "",
  modelId: MODEL,
  start: u(12, "-.06,-2.20"),
  logo: `${P}/logo.png`,
  logoOnLight: true,
  logoSize: 58,
  favicon: `${P}/favicon.png`,
  colors: { main: "#1E1E1E", accent: "#EF5F2F", accentDark: "#C9471D", soft: "#F6F5F2" },
  font: "Libre Franklin",
  fontHeading: "Libre Franklin",
  cta: [
    { label: "Bliv optaget", href: OPTAGET, primary: true },
    { label: "Kontakt", href: KONTAKT, primary: false },
  ],
  contact: { phone: "98 93 05 11", email: "kontakt@tolneefterskole.dk" },
  design: { welcome: "tiles", menu: "side" },
  welcome: {
    kicker: "Tolne Efterskole",
    title: "Hej og velkommen",
    lead: "Her kan du se Tolne Efterskole i dit eget tempo, før du kommer. Hvad vil du gerne?",
    tiles: [
      { kicker: "Med stemme", title: "Tag en rolig rundtur", go: { guide: true }, style: "accent", recommended: true },
      { kicker: "Her bor du", title: "Se hvor du skal bo", go: { room: u(88, "-2.58,1.02"), name: "2-personers værelse" }, style: "light" },
    ],
    skip: "Gå rundt selv",
  },
  guide: {
    manual: true,
    stops: [
      { href: u(12, "-.06,-2.20"), title: "Velkommen", text: "Se skolen i dit eget tempo.", audio: `${P}/velkommen.mp3` },
      { href: u(2, "-2.78,1.27"), title: "Spisesalen", text: "Her spiser vi alle sammen, fem gange om dagen.", audio: `${P}/spisesalen.mp3` },
      { href: u(35, "-3,.29"), title: "Morgensang", text: "Hver morgen hører du, hvad der skal ske i dag.", audio: `${P}/morgensang.mp3` },
      { href: u(88, "-2.58,1.02"), title: "Dit værelse", text: "Man bor typisk to sammen.", audio: `${P}/vaerelset-2pers.mp3` },
      { href: u(162, "-2.81,-1.11"), title: "Værkstederne", text: "Små hold og to lærere på hvert værksted.", audio: `${P}/vaerkstederne.mp3` },
      { href: u(17, "-.18,.5"), title: "Hallen", text: "Idræt om dagen og aktiviteter om aftenen.", audio: `${P}/hallen.mp3` },
      { href: u(50, "-2.98,-.23"), title: "Kontoret", text: "Her finder du de voksne, hvis du har brug for hjælp.", audio: `${P}/kontoret.mp3` },
      { href: "", title: "Tak fordi du så med", text: "Gå rundt selv, eller se turen igen.", audio: `${P}/slut.mp3` },
    ],
  },
  nudge: {
    afterSeconds: 120,
    title: "Kunne du tænke dig at gå her?",
    text: "Kom og se skolen i virkeligheden - eller søg om en plads med det samme.",
    buttons: [
      { label: "Bliv optaget", href: OPTAGET, primary: true },
      { label: "Kontakt skolen", href: KONTAKT },
    ],
  },
  mobileZoomLock: true,
  categories: {},
  points: [],
  navigation: "free",
  hiddenSweeps: [],
  menuOpenOnStart: { desktop: true, mobile: false },
  menu: [
    { title: "Velkommen til Tolne Efterskole", href: u(12, "-.06,-2.20") },
    { title: "Klyngerne", items: [["2-personers værelse", u(126, "-1.65,-1.29")], ["Toilet og bad", u(125, "-1.5,1.35")]] },
    { title: "Højre fløj", items: [["2-personers værelse", u(102, "-1.75,-1.46")], ["Toilet og bad", u(104, "-2.19,1.3")]] },
    {
      title: "Venstre fløj",
      items: [
        ["3-personers værelse", u(84, "-2.77,1.29")],
        ["2-personers værelse", u(88, "-2.58,1.02")],
        ["Toilet og bad", u(94, "-.43,1.23")],
      ],
    },
    {
      title: "Din skoledag",
      items: [
        ["Motor & Metal", u(160, "-3.02,-1.02")],
        ["Bygge & Anlæg", u(162, "-2.81,-1.11")],
        ["Kunst & Kultur", u(75, "-1.87,-1.49")],
        ["Musik", u(39, "-.16,.7")],
        ["Sport", u(68, "-2.91,.75")],
      ],
    },
    {
      title: "Fælles steder",
      items: [
        ["Spisesalen", u(2, "-2.78,1.27")],
        ["Morgensang", u(35, "-3,.29")],
        ["Hallen", u(17, "-.18,.5")],
        ["Fitness", u(25, "-.09,.05")],
      ],
    },
    { title: "De voksne", items: [["Kontoret", u(50, "-2.98,-.23")], ["Forstander og viceforstander", u(53, "-2.94,-.2")]] },
    { title: "Kontakt skolen", href: KONTAKT },
  ],
  matterportParams: { play: "1", qs: "1", help: "0", title: "0", brand: "0", mls: "0", search: "0", vr: "0" },
  flyMs: 800,
};
