/**
 * Halvorsminde, as the first prototype customer - collected from their
 * current setup: the drone page (points, categories, texts), the MPSkins
 * menu and settings (start point, logo, Codes). Hand-written for now; the
 * scalable version keeps this per customer in Arpo.
 */

const TOUR = "https://explore.nextview360.dk/tour/halvorsmindeefterskole";
const u = (ss: number, sr: string) => `${TOUR}?ss=${ss}&sr=${sr}`;

export const halvorsminde = {
  title: "Halvorsminde Efterskole og Halvor Fri Fagskole",
  tourPage: TOUR,
  /** MPSkins "Starting Point" for the tour itself. */
  start: u(2, "-3.13,-.15"),
  logo: "/tours/halvorsminde/top-logo.png",
  subtitle: "Efterskole og Fri Fagskole",
  colors: { petrol: "#15323a", orange: "#e74623", orangeDark: "#c93a1b", sand: "#f4f1ea" },
  font: "Nunito",
  cta: [
    { label: "Book en rundvisning", href: "https://halvorsminde.dk/aabent-hus/", primary: true },
    { label: "Meld dig ind", href: "https://halvorsminde.dk/nye-elever/meld-dig-ind/", primary: false },
  ],
  /** The drone 360°: Pannellum multires tiles (moved over from Lovable), served from Arpo itself. */
  drone: {
    basePath: "/tours/halvorsminde/drone",
    maxLevel: 4,
    cubeResolution: 4096,
    start: { yaw: 8, pitch: -34, hfov: 102 },
    /** Portrait phones see a much wider slice at the same hfov - zoomed in on the school instead. */
    startMobile: { yaw: 16, pitch: -38, hfov: 74 },
  },
  /** 360° photos at some of the points, same tile format (levels 1-3 for now, 2048 px per cube face). */
  panos: { basePath: "/tours/halvorsminde/panos", maxLevel: 3, cubeResolution: 2048 },
  categories: {
    bo: { name: "Her bor du", color: "#c9872f" },
    hverdag: { name: "Din hverdag", color: "#2f8fb5" },
    skole: { name: "Skoledagen", color: "#5a7d2a" },
    vaerk: { name: "Værkstederne", color: "#8a5a2a" },
    sport: { name: "Sport og bevægelse", color: "#b8432b" },
    ude: { name: "Udenfor", color: "#2f7d4f" },
  } as Record<string, { name: string; color: string }>,
  /** Points on the drone picture (yaw/pitch in degrees) - `tour` is where "Gå ind" lands. */
  points: [
    { id: "vaerelse2", name: "2-mandsværelse", cat: "bo", icon: "seng", yaw: 14.7, pitch: -23.2, tour: u(13, "-3.08,-.19"),
      text: "På et 2-mandsværelse bor du sammen med én anden elev. Det er her, de tætte venskaber for alvor opstår. Værelserne ligger i fløjen ved gårdspladsen.", chips: ["2 elever", "Nye venner", "Dit hjem i skoleåret"] },
    { id: "vaerelse3", name: "3-mandsværelse", cat: "bo", icon: "seng", yaw: 51.7, pitch: -26.7, tour: u(154, "3.13,.31"),
      text: "På et 3-mandsværelse deler du hverdagen med to andre elever. Disse værelser ligger i fløjen op mod markerne og boldbanen.", chips: ["3 elever", "Fællesskab", "Tæt på naturen"] },
    { id: "vaerelse4", name: "4-mandsværelse", cat: "bo", icon: "seng", yaw: 1.5, pitch: -35.1, tour: u(121, ".06,.72"),
      text: "På et 4-mandsværelse er I fire, der bor sammen. Værelserne ligger i fløjen ned mod værkstederne.", chips: ["4 elever", "Masser af liv", "Dit hjem i skoleåret"] },
    { id: "faellesrum", name: "Fællesrummet", cat: "hverdag", icon: "sofa", yaw: 13.1, pitch: -42.1, tour: u(105, "3.09,-1.1"),
      text: "Fællesrummet er hjertet i hverdagen. Her hænger man ud, spiller, snakker og er sammen, når undervisningen er slut.", chips: ["Hygge", "Samvær", "Fritid"] },
    { id: "foredrag", name: "Foredragssalen", cat: "hverdag", icon: "mic", yaw: 1.2, pitch: -44.7, tour: u(79, "-3.05,1.01"),
      text: "Foredragssalen bruges til fællessamlinger, foredrag og arrangementer for hele skolen.", chips: ["Samlinger", "Foredrag", "Arrangementer"] },
    { id: "metal", name: "Motor-metal", cat: "vaerk", icon: "skrue", yaw: 65.3, pitch: -30.3, tour: u(227, "-.05,.41"),
      text: "På motor-metal-værkstedet arbejder eleverne med maskiner, motorer og metal. Her lærer man at bruge hænderne og værktøjet.", chips: ["Motor", "Metal", "Praktisk"] },
    { id: "sloejd", name: "Sløjd", cat: "vaerk", icon: "hammer", yaw: 64.1, pitch: -36.9, tour: u(246, "-.17,-1.08"),
      text: "I sløjdlokalet bygger og skaber eleverne i træ, fra de små projekter til de store.", chips: ["Træ", "Håndværk", "Skab selv"] },
    { id: "styling", name: "Styling", cat: "vaerk", icon: "saks", yaw: 41.8, pitch: -31.8, tour: u(164, "-3.04,-.8"),
      text: "På styling-linjen arbejder eleverne med hår, makeup og personligt udtryk.", chips: ["Hår", "Makeup", "Udtryk"] },
    { id: "gastro", name: "GastroFabrikken", cat: "vaerk", icon: "mad", yaw: 20.7, pitch: -46.3, tour: u(127, "-.12,-.46"),
      text: "GastroFabrikken er skolens køkken-værksted, hvor eleverne laver mad, bager og lærer håndværket bag et måltid.", chips: ["Mad", "Bagning", "Køkken"] },
    { id: "hal", name: "Hallen", cat: "sport", icon: "hal", yaw: -35.9, pitch: -28.2, tour: u(202, ".01,-.72"),
      text: "I den store idrætshal spilles bold, dyrkes idræt og holdes aktiviteter året rundt.", chips: ["Idræt", "Boldspil", "Indendørs"] },
    { id: "fitness", name: "Fitness & Crossfit", cat: "sport", icon: "loeft", yaw: -22.6, pitch: -43.5, tour: u(207, "-.04,.85"),
      text: "Fitness og crossfit ligger i starten af hallen, med plads til træning med vægte, kondition og egen kropsvægt.", chips: ["Fitness", "Crossfit", "I hallen"] },
    { id: "fodbold", name: "Fodboldbanen", cat: "ude", icon: "bold", yaw: 25.7, pitch: -10.6, tour: null, pano: "fodbold",
      text: "Skolens fodboldbane ligger lige uden for bygningerne, med masser af plads til kampe og træning.", chips: ["Fodbold", "Udendørs"] },
    { id: "skov", name: "Skoven og naturen", cat: "ude", icon: "skov", yaw: 30, pitch: -16.4, tour: null, pano: "skov",
      text: "Skolen ligger naturskønt med skov og marker lige udenfor, perfekt til bål, udeliv og en pause i det grønne.", chips: ["Skov", "Natur", "Udeliv"] },
    { id: "sauna", name: "Sauna og koldvandsbassin", cat: "ude", icon: "sauna", yaw: -18.8, pitch: -28.3, tour: null, pano: "sauna",
      text: "Sauna og koldvandsbassin giver mulighed for at slappe af og tage den kolde dukkert efter en lang dag.", chips: ["Sauna", "Koldt bad", "Afslapning"] },
    { id: "shelter", name: "Shelter", cat: "ude", icon: "skov", yaw: 87.3, pitch: -11.7, tour: null, pano: "shelter",
      text: "Skolens shelter ligger i naturen tæt på skolen og bruges til overnatning, bål og udeliv.", chips: ["Overnatning ude", "Bål", "Udeliv"] },
    { id: "volleyball", name: "Volleyball", cat: "sport", icon: "bold", yaw: -10, pitch: -17, tour: null, pano: "volleyball",
      text: "Beachvolley-banen er et af skolens udendørs samlingssteder, når vejret er til det.", chips: ["Beachvolley", "Udendørs", "Sammen"] },
  ] as { id: string; name: string; cat: string; icon: string; yaw: number; pitch: number; tour: string | null; pano?: string; text: string; chips: string[] }[],
  /** "free": walk around as in Matterport. "points": only the menu and points move you (e.g. Hals Camping). */
  navigation: "free" as "free" | "points",
  /** Extra scan points to hide (sweep ids) - the ones hidden in MPSkins are picked up automatically. */
  hiddenSweeps: [] as string[],
  /** MPSkins "navOpenOnStart", per device. */
  menuOpenOnStart: { desktop: false, mobile: false },
  /** The MPSkins menu, as it is today. */
  menu: [
    { title: "Velkommen til Halvorsminde", href: u(2, "-3.13,-.15") },
    { title: "Skolen fra luften", href: "#luften" },
    { title: "Her bor du", items: [["2-mandsværelse", u(13, "-3.08,-.19")], ["3-mandsværelse", u(154, "3.13,.31")], ["4-mandsværelse", u(121, ".06,.72")]] },
    { title: "Din hverdag", items: [["Spisesalen", u(34, "-3.12,1.05")], ["Fællesrummet", u(105, "3.09,-1.1")], ["Pusterummet", u(82, "-2.91,-.8")], ["Foredragssalen", u(79, "-3.05,1.01")], ["Teatersalen", u(128, "-.02,.24")]] },
    { title: "Skoledagen", items: [["Klasselokalet", u(44, "-2.94,-.71")], ["Fysik-kemi", u(170, "-3.09,-.69")], ["Biblioteket", u(47, "-.12,-.82")]] },
    { title: "Værkstederne", items: [["Motor-metal", u(227, "-.05,.41")], ["Sløjd", u(246, "-.17,-1.08")], ["Styling", u(164, "-3.04,-.8")], ["Neglefabrikken", u(160, "-3,.87")], ["Business & event", u(225, "-2.49,1.41")], ["GastroFabrikken", u(127, "-.12,-.46")]] },
    { title: "Sport og bevægelse", items: [["Hallen", u(202, ".01,-.72")], ["Crossfit", u(207, "-.04,.85")], ["Fitness", u(211, "-.08,1.17")], ["Padel", "https://halvorsminde.dk/linjefag/padel/"], ["Ridning", "https://halvorsminde.dk/linjefag/ridning/"]] },
  ] as ({ title: string; href: string } | { title: string; items: [string, string][] })[],
  /** MPSkins "Codes" as Matterport URL parameters: no help, autostart, no dollhouse/guided tour/highlight reel/floor/floor plan/VR buttons, no Matterport title or branding. */
  matterportParams: { play: "1", qs: "1", help: "0", dh: "0", gt: "0", hr: "0", f: "0", fp: "0", vr: "0", title: "0", brand: "0", mls: "0", search: "0" },
  /** MPSkins: Deep Link Transitions FLY, 800 ms. */
  flyMs: 800,
};
