import type { TourConfig } from "./types";

/**
 * Tolne Efterskole - a special efterskole (ADHD, autism, reduced cognitive
 * functioning are common among the students). Built to be calm, plain and
 * predictable ("Helt enkel"): two big buttons to start, a menu that is one
 * list, nothing pops up by itself, places fade in instead of flying,
 * the voice tour waits for the visitor and always says what comes next, and
 * "Sådan ser en dag ud" shows the real day (from the school's ugeskema
 * 26/27) with where each part happens. Parents and caseworkers get their own
 * way in: book the personal tour of the school - which is where admission
 * always starts. The voice files and the logo live with us (public/tours/tolne).
 */
const MODEL = "XHguBSNvBnU";
/** A spot in the model: scan point and view, as copied from the MPSkins menu. */
const u = (ss: number, sr: string) => `https://my.matterport.com/show/?m=${MODEL}&ss=${ss}&sr=${sr}`;
const P = "/tours/tolne";
const SITE = "https://www.tolneefterskole.dk";
const OPTAGET = `${SITE}/bliv-optaget/`;
const KONTAKT = `${SITE}/kontakt/`;
const ROOM = u(88, "-2.58,1.02");
const DINING = u(2, "-2.78,1.27");
const MORNING = u(35, "-3,.29");
const WORKSHOP = u(162, "-2.81,-1.11");
const HALL = u(17, "-.18,.5");
const OFFICE = u(50, "-2.98,-.23");

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
  // Admission always starts with a personal tour of the school, booked by phoning the office.
  cta: [
    { label: "Book en rundvisning", href: KONTAKT, primary: true },
    { label: "Sådan bliver du optaget", href: OPTAGET, primary: false },
  ],
  contact: { address: "Dvergetvedvej 95, Tolne, 9870 Sindal", phone: "98 93 05 11", email: "kontakt@tolneefterskole.dk" },
  // Calm: places fade in instead of flying through the building.
  jump: "fade",
  // "Helt enkel": a few big buttons, and a menu that is one plain list - nothing else.
  design: { welcome: "simple", menu: "simple" },
  welcome: {
    kicker: "Tolne Efterskole",
    title: "Hej og velkommen",
    lead: "Her kan du se Tolne Efterskole. Der sker ikke noget, før du selv trykker.",
    tiles: [
      { kicker: "", title: "Start rundturen", go: { guide: true }, style: "accent" },
      { kicker: "", title: "Se en dag på skolen", go: { day: true }, style: "light" },
    ],
    skip: "Kig selv rundt",
  },
  day: {
    title: "Sådan ser en dag ud",
    lead: "Sådan ser en almindelig dag ud. Tryk på \"Se stedet\" for at se, hvor det sker.",
    steps: [
      { time: "7.45", title: "Morgenmad", text: "Vi starter dagen med morgenmad sammen.", href: DINING },
      { time: "8.30", title: "Orientering og morgensang", text: "Her hører du, hvad der skal ske i dag.", href: MORNING },
      { time: "9.00", title: "Værksted", text: "Du lærer ved at gøre det. To lærere og et lille hold.", href: WORKSHOP },
      { time: "10.20", title: "Formiddagsmad", href: DINING },
      { time: "10.40", title: "Værksted", text: "Dansk, matematik, engelsk og natur - der hvor du skal bruge det.", href: WORKSHOP },
      { time: "12.00", title: "Kontaktlærertid", text: "Tid til at tale med din kontaktlærer.", href: OFFICE },
      { time: "12.30", title: "Middag", text: "Som regel varm mad.", href: DINING },
      { time: "13.30", title: "Værksted, valgfag eller idræt", text: "To eftermiddage om ugen er der valgfag eller idræt.", href: HALL },
      { time: "15.30", title: "Kaffe, te og fri tid", href: ROOM },
      { time: "18.00", title: "Aftensmad", href: DINING },
      { time: "19.30", title: "Aftenaktiviteter", text: "Spil, sport, noget kreativt, bål - eller bare være sammen.", href: HALL },
      { time: "22.00", title: "Godnat", href: ROOM },
    ],
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
  mobileZoomLock: true,
  categories: {},
  points: [],
  navigation: "free",
  hiddenSweeps: [],
  menuOpenOnStart: { desktop: false, mobile: false },
  // One plain list: the places a new student wants to see, then the workshops, then what parents need.
  menu: [
    { title: "Velkommen", href: u(12, "-.06,-2.20") },
    { title: "Dit værelse", href: ROOM },
    { title: "Toilet og bad", href: u(94, "-.43,1.23") },
    { title: "Spisesalen", href: DINING },
    { title: "Morgensang", href: MORNING },
    { title: "Hallen", href: HALL },
    { title: "Kontoret", href: OFFICE },
    {
      title: "Værkstederne",
      items: [
        ["Motor & Metal", u(160, "-3.02,-1.02")],
        ["Bygge & Anlæg", u(162, "-2.81,-1.11")],
        ["Kunst & Kultur", u(75, "-1.87,-1.49")],
        ["Musik", u(39, "-.16,.7")],
        ["Sport", u(68, "-2.91,.75")],
      ],
    },
    {
      title: "Til forældre",
      items: [
        ["Book en rundvisning", KONTAKT],
        ["Sådan bliver du optaget", OPTAGET],
      ],
    },
  ],
  matterportParams: { play: "1", qs: "1", help: "0", title: "0", brand: "0", mls: "0", search: "0", vr: "0" },
  flyMs: 800,
};
