import type { TourConfig } from "./types";

/*
 * Ready-made ways to build a tour - the start, the menu and how you move -
 * each made for a kind of customer. Picked in "Ny tour" (recommended by
 * branch) and in the editor's Design tab, where hovering one shows it in the
 * live preview before it's chosen.
 */

export type Branch = "efterskole" | "specialskole" | "restaurant" | "fitness" | "hotel" | "butik" | "lager" | "camping" | "erhverv" | "andet";

export const BRANCHES: [Branch, string][] = [
  ["efterskole", "Efterskole / højskole"],
  ["specialskole", "Specialskole / særlige behov"],
  ["restaurant", "Restaurant / café"],
  ["fitness", "Fitness"],
  ["hotel", "Hotel / konference"],
  ["butik", "Butik / showroom"],
  ["lager", "Lager / depotrum"],
  ["camping", "Camping / stort område"],
  ["erhverv", "Erhverv / kontor"],
  ["andet", "Andet"],
];

/** What the tour should drive visitors to, per branch - suggestions for the focus field. */
export const FOCUS: Record<Branch, string[]> = {
  efterskole: ["Book en rundvisning", "Ledige pladser", "Se værelserne"],
  specialskole: ["Book en rundvisning", "Vis hvordan en dag ser ud", "Se værelserne"],
  restaurant: ["Book bord", "Bestil takeaway", "Selskaber og events"],
  fitness: ["Bliv medlem", "Prøv gratis", "Holdplan"],
  hotel: ["Book værelse", "Møder og konferencer", "Restauranten"],
  butik: ["Book en fremvisning", "Find os", "Se udvalget"],
  lager: ["Lej et rum", "Se priser og størrelser", "Find vej til rummet"],
  camping: ["Book plads", "Se hytterne", "Faciliteter"],
  erhverv: ["Book et møde", "Ledige lokaler", "Kontakt os"],
  andet: ["Book", "Kontakt os"],
};

export type DesignPreset = {
  id: "klassisk" | "forside" | "direkte" | "rumvaelger" | "guidet" | "enkel";
  name: string;
  /** One line on what it is. */
  what: string;
  /** When it works best. */
  when: string;
  recommendedFor: Branch[];
  /** What the preset sets on a tour (texts are filled in from the tour itself). */
  apply: (T: TourConfig) => Partial<TourConfig>;
};

const welcomeFor = (T: TourConfig, guideFirst: boolean): NonNullable<TourConfig["welcome"]> =>
  T.welcome ?? {
    kicker: T.brand,
    title: `Velkommen til ${T.brand}`,
    lead: guideFirst ? "Lad os vise dig rundt - eller hop direkte derhen, du vil se." : "Tag en tur rundt - eller hop direkte derhen, du vil se.",
    tiles: guideFirst ? [{ kicker: "Første gang her?", title: "Vis mig rundt", go: { guide: true }, style: "accent", recommended: true }] : [],
    skip: "Jeg kigger selv rundt",
  };

const coverFor = (T: TourConfig): NonNullable<TourConfig["cover"]> =>
  T.cover ?? {
    kicker: T.subtitle ?? T.brand,
    title: `Velkommen til ${T.brand}`,
    lead: "Kig indenfor før du kommer.",
    image: T.places?.[0]?.image ?? T.logo,
    enter: "Træd indenfor",
    placesTitle: "Vælg hvor du vil starte",
  };

export const DESIGN_PRESETS: DesignPreset[] = [
  {
    id: "klassisk",
    name: "Klassisk",
    what: "Velkomst med fliser og en sidemenu med grupper.",
    when: "Mange rum i grupper - fx værelser, undervisning, fællesrum.",
    recommendedFor: ["efterskole", "erhverv", "andet"],
    apply: (T) => ({ design: { welcome: "tiles", menu: "side" }, welcome: welcomeFor(T, false), navigation: "free", jump: "fly", menuOpenOnStart: { desktop: true, mobile: false } }),
  },
  {
    id: "forside",
    name: "Forside med foto",
    what: "Stort foto af stedet, én knap ind og en bar i bunden.",
    when: "Steder, der skal føles indbydende - restaurant, showroom, hotel.",
    recommendedFor: ["restaurant", "butik", "hotel"],
    apply: (T) => ({ design: { welcome: "cover", menu: "dock" }, cover: coverFor(T), navigation: "free", jump: "fly", menuOpenOnStart: { desktop: false, mobile: false } }),
  },
  {
    id: "direkte",
    name: "Direkte ind",
    what: "Ingen velkomst - touren starter med det samme, rummene som historier.",
    when: "Når folk kommer fra en knap på hjemmesiden, der allerede har fortalt historien.",
    recommendedFor: ["fitness", "camping"],
    apply: () => ({ design: { welcome: "tiles", menu: "side" }, welcome: undefined, navigation: "free", jump: "fly", menuOpenOnStart: { desktop: false, mobile: false }, stories: { mobile: true, desktop: true } }),
  },
  {
    id: "rumvaelger",
    name: "Rumvælger",
    what: "Vælg størrelse og rum i bunden - skifter direkte, ingen gåtur.",
    when: "Ens rum i flere størrelser - depotrum, hotelværelser, kontorer.",
    recommendedFor: ["lager"],
    apply: () => ({ design: { welcome: "tiles", menu: "picker" }, welcome: undefined, navigation: "points", jump: "instant", menuOpenOnStart: { desktop: false, mobile: false } }),
  },
  {
    id: "guidet",
    name: "Guidet salg",
    what: "Velkomst med \"Vis mig rundt\" først og \"Din plads venter\" efter et stykke tid.",
    when: "Når touren skal sælge - fx flere elever, medlemmer eller bookinger.",
    recommendedFor: ["efterskole", "fitness", "camping"],
    apply: (T) => ({
      design: { welcome: "tiles", menu: "side" },
      welcome: welcomeFor(T, true),
      navigation: "free",
      jump: "fly",
      menuOpenOnStart: { desktop: false, mobile: false },
      nudge: T.nudge ?? { afterSeconds: 90, title: "Din plads venter", text: "Har du set nok til at tage det næste skridt?", buttons: [] },
    }),
  },
  {
    id: "enkel",
    name: "Helt enkel",
    what: "Få store knapper og én menu-knap med én liste. Intet dukker op af sig selv.",
    when: "Gæster, der skal have det roligt og forudsigeligt - fx specialskoler (autisme, ADHD).",
    recommendedFor: ["specialskole"],
    apply: (T) => ({
      design: { welcome: "simple", menu: "simple" },
      welcome: T.welcome
        ? { ...T.welcome, tiles: T.welcome.tiles.slice(0, 3) }
        : { kicker: T.brand, title: "Hej og velkommen", lead: "Se stedet i dit eget tempo. Der sker ikke noget, før du selv trykker.", tiles: [{ kicker: "", title: "Start rundturen", go: { guide: true }, style: "accent" }], skip: "Kig selv rundt" },
      navigation: "free",
      jump: "fade",
      menuOpenOnStart: { desktop: false, mobile: false },
      nudge: undefined,
      guide: T.guide ? { ...T.guide, manual: true } : undefined,
    }),
  },
];

/** Which preset a tour looks like now (for the Design tab's tick). */
export function currentPreset(T: TourConfig): DesignPreset["id"] | null {
  const menu = T.design?.menu ?? "side";
  if (menu === "simple" || T.design?.welcome === "simple") return "enkel";
  if (menu === "picker") return "rumvaelger";
  if (T.design?.welcome === "cover") return "forside";
  if (!T.welcome) return "direkte";
  if (T.welcome.tiles.some((t) => "guide" in t.go) && T.nudge) return "guidet";
  return "klassisk";
}

/*
 * The three layout steps - the same in "Ny tour" and the editor's Layout tab:
 * 1. how the tour starts, 2. the menu, 3. where things sit.
 */
export type StartStyle = "none" | "tiles" | "simple" | "cover";
export type MenuStyle = NonNullable<TourConfig["design"]>["menu"];

export const START_STYLES: [StartStyle, string, string][] = [
  ["cover", "Forside med foto", "Et stort foto af stedet med en knap ind og stederne at vælge imellem - premium, og fortsætter hjemmesidens fortælling."],
  ["tiles", "Fliser", "En kort velkomst med fliser til de vigtigste steder. Godt når der er få, tydelige valg."],
  ["simple", "Helt enkel", "Få store knapper under hinanden - intet andet. Til gæster, der skal have det helt roligt (fx specialskoler). Hold det til 2-3 knapper."],
  ["none", "Direkte i touren", "Touren starter med det samme - godt når folk kommer fra en knap på hjemmesiden, der allerede har fortalt historien."],
];

export const MENU_STYLES: [MenuStyle, string, string][] = [
  ["side", "Sidemenu", "En menu i siden med grupper - til mange rum."],
  ["dock", "Bar i bunden", "Stederne, rundvisningen og hovedknappen i en bar nederst."],
  ["bento", "Flisemenu", "Menuen som store billedfliser."],
  ["simple", "Helt enkel", "Én knap med én liste - intet andet."],
  ["picker", "Rumvælger", "Vælg størrelse og rum i bunden. Kun til få kunder (fx depotrum)."],
];

/** How a tour starts now. */
export const startStyleOf = (T: TourConfig): StartStyle => (T.design?.welcome === "cover" ? "cover" : T.design?.welcome === "none" ? "none" : T.welcome ? (T.design?.welcome === "simple" ? "simple" : "tiles") : "none");

/** Sets the start and the menu on a tour (changes `d`), filling in a welcome or a cover from the tour itself when it has none - never removing one already made. */
export function setLayout(d: TourConfig, start: StartStyle, menu: MenuStyle): void {
  if (start === "none") {
    // The tiles are kept - only not shown - so switching back brings them back.
    d.design = { ...d.design, welcome: "none", menu };
  } else if (start === "tiles" || start === "simple") {
    d.welcome ??= { kicker: d.brand, title: `Velkommen til ${d.brand}`, lead: "Tag en tur rundt - eller hop direkte derhen, du vil se.", tiles: [], skip: "Jeg kigger selv rundt" };
    d.design = { ...d.design, welcome: start, menu };
  } else {
    d.cover ??= { kicker: d.subtitle ?? d.brand, title: `Velkommen til ${d.brand}`, lead: "Kig indenfor før du kommer.", image: d.places?.[0]?.image ?? d.logo, enter: "Træd indenfor", placesTitle: "Vælg hvor du vil starte" };
    d.design = { ...d.design, welcome: "cover", menu };
  }
}

/** What "Ny tour" chooses in the layout steps - the branch's recommended design fills it in first. */
export type NewTourLayout = { start: StartStyle; menu: MenuStyle; logoSide: "left" | "right"; menuHint: "off" | "mobile" | "all" };

export const PRESET_LAYOUT: Record<DesignPreset["id"], Pick<NewTourLayout, "start" | "menu">> = {
  klassisk: { start: "tiles", menu: "side" },
  forside: { start: "cover", menu: "dock" },
  direkte: { start: "none", menu: "side" },
  rumvaelger: { start: "none", menu: "picker" },
  guidet: { start: "tiles", menu: "side" },
  enkel: { start: "simple", menu: "simple" },
};
