import type { TourConfig } from "./types";

/**
 * Tolne Efterskole - a special efterskole (ADHD, autism, reduced cognitive
 * functioning are common among the students). Built to be calm and
 * predictable: nothing pops up by itself, places fade in instead of flying,
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
  design: { welcome: "tiles", menu: "side" },
  welcome: {
    kicker: "Tolne Efterskole",
    title: "Hej og velkommen",
    lead: "Her kan du se skolen i dit eget tempo, før du kommer. Der sker ikke noget, før du selv trykker. Hvad vil du gerne?",
    tiles: [
      { kicker: "Med stemme", title: "Tag en rolig rundtur", go: { guide: true }, style: "accent", recommended: true },
      { kicker: "Her bor du", title: "Se hvor du skal bo", go: { room: ROOM, name: "2-personers værelse" }, style: "light" },
      { kicker: "7.45 til 22.00", title: "Sådan ser en dag ud", go: { day: true }, style: "light" },
      { kicker: "Forældre og fagfolk", title: "Book en rundvisning", go: { href: KONTAKT }, style: "dark" },
    ],
    skip: "Gå rundt selv",
  },
  day: {
    title: "Sådan ser en dag ud",
    lead: "En almindelig skoledag på Tolne Efterskole. Tryk på \"Se stedet\" for at se, hvor det sker.",
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
  // Short, concrete facts when you arrive at a place (from the school's own site) - no pop-ups after a while, no timers.
  placeCards: [
    { ss: [88, 126, 102, 84], title: "Sådan bor du", text: "Det første år bor du på skolen - typisk sammen med én eller to. Toilet og bad deler I med værelset ved siden af." },
    { ss: [2], title: "Spisesalen", text: "Vi spiser fem måltider om dagen sammen, så krop og hjerne kan holde sig godt i gang." },
    { ss: [160], title: "Motor & Metal", text: "Har du benzin i blodet? Her svejser du og arbejder med metal og motorer." },
    { ss: [162], title: "Bygge & Anlæg", text: "Her arbejder du med træ, bygger et skur eller murer en væg." },
    { ss: [75], title: "Kunst & Kultur", text: "Her tegner, maler og laver du keramik." },
    { ss: [39], title: "Musik", text: "Her lærer du at synge og spille - pop, rock eller klassisk." },
    { ss: [50, 53], title: "De voksne", text: "Alle elever har en kontaktlærer, der kender dem godt. Her på kontoret kan du altid få hjælp." },
  ],
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
    {
      title: "Til forældre og fagfolk",
      items: [
        ["Book en rundvisning", KONTAKT],
        ["Sådan bliver du optaget", OPTAGET],
        ["Særlig støtte", `${SITE}/saerlig-stoette/`],
        ["Kørestol", `${SITE}/koerestol/`],
        ["Forældre-info", `${SITE}/foraeldre-info/`],
      ],
    },
  ],
  matterportParams: { play: "1", qs: "1", help: "0", title: "0", brand: "0", mls: "0", search: "0", vr: "0" },
  flyMs: 800,
};
