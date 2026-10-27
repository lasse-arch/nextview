/**
 * Halvorsminde, as the first prototype customer - collected from their
 * current setup: the drone page (points, categories, texts), the MPSkins
 * menu and settings (start point, logo, Codes). Hand-written for now; the
 * scalable version keeps this per customer in Arpo.
 */

const TOUR = "https://explore.nextview360.dk/tour/halvorsmindeefterskole";
const u = (ss: number, sr: string) => `${TOUR}?ss=${ss}&sr=${sr}`;

import type { TourConfig } from "./types";

export const halvorsminde: TourConfig = {
  slug: "halvorsminde",
  brand: "Halvorsminde",
  title: "Halvorsminde Efterskole og Halvor Fri Fagskole",
  tourPage: TOUR,
  /** MPSkins "Starting Point" for the tour itself. */
  start: u(2, "-3.13,-.15"),
  logo: "/tours/halvorsminde/top-logo.png",
  subtitle: "Efterskole og Fri Fagskole",
  colors: { main: "#15323a", accent: "#e74623", accentDark: "#c93a1b", soft: "#f4f1ea" },
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
    intro: { title: "Velkommen til Halvorsminde", lead: "Se hele skolen fra luften. Tryk på et punkt, og gå direkte ind i rummet." },
    backLabel: "Skolen fra luften",
    filterTitle: "Find rundt på skolen",
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
  },
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
  ],
  /**
   * The welcome (entry popup) as tiles. A choice can open the drone scene
   * with one category picked out, go straight into a room, or open a link -
   * and a returning visitor gets "Fortsæt hvor du slap" on top.
   */
  welcome: {
    kicker: "Halvorsminde Efterskole og Fri Fagskole",
    title: "Velkommen indenfor",
    lead: "Se skolen fra luften, gå direkte ind i værelserne, eller find dit værksted. Hvor vil du starte?",
    tiles: [
      { kicker: "Overblik", title: "Skolen fra luften", go: { drone: null }, style: "dark", recommended: true },
      { kicker: "Her bor du", title: "Se et værelse", go: { room: u(13, "-3.08,-.19"), name: "2-mandsværelse" }, style: "light" },
      { kicker: "Linjer og værksteder", title: "Find dit værksted", go: { drone: "vaerk" }, style: "light" },
      { kicker: "Din hverdag", title: "Spisesalen", go: { room: u(34, "-3.12,1.05"), name: "Spisesalen" }, style: "light" },
      { kicker: "Næste skridt", title: "Book en rundvisning", go: { href: "https://halvorsminde.dk/aabent-hus/" }, style: "accent" },
    ],
    skip: "Jeg kigger selv rundt",
  },
  /** "free": walk around as in Matterport. "points": only the menu and points move you (e.g. Hals Camping). */
  navigation: "free",
  /** Extra scan points to hide (sweep ids) - the ones hidden in MPSkins are picked up automatically. */
  hiddenSweeps: [],
  /** MPSkins "navOpenOnStart", per device. */
  menuOpenOnStart: { desktop: false, mobile: false },
  stories: { mobile: true, desktop: false },
  /** The place cards from the MPSkins tour (its sweep-action popups), brought over as they are. */
  placeCards: [
    {"ss": [2], "title": "Velkommen til Halvorsminde", "text": "Herfra kan du se det hele: bygningerne, fodboldbanen og skoven omkring. Siden 1903 har elever startet deres efterskoleår her, og Halvorsminde er en af Danmarks 20 ældste efterskoler. Brug menuen, og se hvor du skal bo."},
    {"ss": [13], "title": "To på værelset", "text": "136 elever, lige mange drenge og piger, bor på skolen. På et 2-mandsværelse får du én værelseskammerat, der hurtigt bliver den, du kender allerbedst. Når du er på besøg, kan du spørge, hvordan man bliver sat sammen."},
    {"ss": [154], "title": "Tre på værelset", "text": "Der er altid nogen at snakke med, når lyset er slukket, og altid én, der kan vække dig til morgenmad. Spørg på besøget, hvad du selv må tage med hjemmefra."},
    {"ss": [121], "title": "Fire på værelset", "text": "Flere venner, flere historier og aldrig en kedelig aften. Et værelse med fire bliver hurtigt et lille fællesskab for sig. Spørg, hvordan man gør værelset til sit eget."},
    {"ss": [105], "title": "Her sker aftenerne", "text": "Når undervisningen er slut, samles man her til spil, snak, film eller bare hygge. Det er her, klassekammerater bliver til venner. Spørg eleverne, hvad der sker her en helt almindelig tirsdag aften."},
    {"ss": [30, 31, 32, 33, 34, 35, 36, 37], "title": "Hele skolen ved bordet", "text": "Til måltiderne samles hele skolen. Det er her, dagen starter, og her dagens historier bliver fortalt. Spørg på besøget, hvordan en almindelig dag ser ud fra morgenmad til aftenkaffe."},
    {"ss": [82, 83, 84], "title": "Pusterummet", "text": "Et efterskoleår er fyldt med liv, og nogle gange har man brug for at trække vejret. Her kan du komme ind, få en god snak og slå tankerne lidt væk fra den travle hverdag."},
    {"ss": [79, 80, 81], "title": "Her samles skolen", "text": "Foredragssalen bruges, når skolen samles om foredrag og fællesarrangementer. Det er noget af det, man husker bagefter: de aftener, hvor hele skolen sad sammen og blev klogere."},
    {"ss": [128, 129, 130, 131], "title": "Scenen", "text": "Teatersalen er skolens scene. Her kan dansen og musikken vise, hvad de har arbejdet med. Spørg på besøget, hvornår der er opvisninger og koncerter i løbet af året.", "more": {"label": "Læs om dans og musik", "text": "På linjefaget Dans møder du hip-hop, house, contemporary og showdans. I arbejder med teknik, grounding og udtryk, og du behøver ingen erfaring. På linjefaget Musik lærer du at spille efter gehør og becifringer og arbejder med sammenspil, sang og musikproduktion. Du behøver ikke være god i forvejen, bare elske musik."}},
    {"ss": [44, 45], "title": "Her lærer du", "text": "Sådan ser et klasselokale ud på Halvorsminde. Her har du dine boglige fag, uanset om du går i 9. klasse, 10. klasse eller på Idræt, som er en prøvefri 10. klasse.", "more": {"label": "Læs om skoleformerne", "text": "På efterskolen kan du vælge mellem 9. klasse, 10. klasse (FP10) og Idræt, som er en prøvefri 10. klasse. Vil du videre bagefter, kan du tage dit 10. eller 11. skoleår på Fri Fagskole. Her vælger du en fagretning: Business & Event, FORCE, Gastronomi & Konditori, Håndværk – Kloge Hænder eller Style & Wellness. Der gives ingen karakterer, og året slutter med en fagprøve og et fagbevis."}},
    {"ss": [169, 170, 171, 172, 173], "title": "Forsøg og eksperimenter", "text": "I fysik-kemi bliver teorien til noget, du kan se og afprøve. Spørg på besøget, hvilke forsøg eleverne laver i løbet af året."},
    {"ss": [47, 48], "title": "Ro til fordybelse", "text": "Et roligt sted til lektier, læsning og projekter, når man har brug for at koncentrere sig lidt væk fra fællesskabets larm."},
    {"ss": [122, 123, 124, 125, 126, 127], "title": "Velkommen i GastroFabrikken", "text": "Du skal ikke kunne lave mad i forvejen, bare være nysgerrig. Her har linjefaget Gastro og valgfaget BageFabrikken til huse, og på Fri Fagskole kan du gå videre med Gastronomi & Konditori.", "more": {"label": "Læs om GastroFabrikken", "text": "I det helt nye skolekøkken arbejder du med madlavningsteknikker, bagning, sæsonens råvarer og de nyeste madtrends. Eleverne laver også mad til events og pop-up middage for gæster både på og uden for skolen. På Gastronomi & Konditori lærer du at mestre både det salte og det søde køkken, fra sprøde surdejsboller og klassiske kager til kreative retter, med fokus på kvalitet og bæredygtighed. Fri Fagskole er for 10. og 11. skoleår. Der gives ingen karakterer, og året slutter med en fagprøve og et fagbevis."}},
    {"ss": [183, 184, 185, 186, 187, 188, 189, 190, 191, 192, 193, 194, 227], "title": "Byg det selv", "text": "Her arbejder linjefaget Træ og metal og Fri Fagskolens Håndværk – Kloge Hænder. Du behøver ingen erfaring med værkstedsarbejde, bare lyst til at skabe med hænderne.", "more": {"label": "Læs om værkstedet", "text": "Du starter med faste opgaver, lærer at lave arbejdstegninger og går så i gang med dine egne projekter. Undervejs får du den lovpligtige §17-sikkerhedsuddannelse, så du kan arbejde med CO2- og lysbuesvejsning. På Håndværk – Kloge Hænder arbejder du med både træ og metal, fra idé og design til færdigt produkt. Fri Fagskole er for 10. og 11. skoleår. Der gives ingen karakterer, og året slutter med en fagprøve og et fagbevis."}},
    {"ss": [246, 247, 248, 249, 250], "title": "Byg det selv", "text": "Her arbejder linjefaget Træ og metal og Fri Fagskolens Håndværk – Kloge Hænder. Du behøver ingen erfaring med værkstedsarbejde, bare lyst til at skabe med hænderne.", "more": {"label": "Læs om værkstedet", "text": "Du starter med faste opgaver, lærer at lave arbejdstegninger og går så i gang med dine egne projekter. Undervejs får du den lovpligtige §17-sikkerhedsuddannelse, så du kan arbejde med CO2- og lysbuesvejsning. På Håndværk – Kloge Hænder arbejder du med både træ og metal, fra idé og design til færdigt produkt. Fri Fagskole er for 10. og 11. skoleår. Der gives ingen karakterer, og året slutter med en fagprøve og et fagbevis."}},
    {"ss": [164, 165, 166, 167], "title": "Styling", "text": "Hår, opsætninger og makeup. Her har valgfaget Styling og Fri Fagskolens Style & Wellness til huse, for dig, der brænder for at få andre til at føle sig godt tilpas.", "more": {"label": "Læs om Style & Wellness", "text": "På Style & Wellness lærer du færdigheder, der kan åbne dørene til en karriere som frisør, makeup-artist, kosmetiker eller negletekniker. Du dykker ned i hårpleje, opsætninger og farveteknikker og øver dig på frisørdukker. Fri Fagskole er for 10. og 11. skoleår. Der gives ingen karakterer, og året slutter med en fagprøve og et fagbevis."}},
    {"ss": [160, 161, 162, 163], "title": "Neglefabrikken", "text": "Neglefabrikken hører til Fri Fagskolens Style & Wellness. Her øver du dig i negledesign og pleje, og det er et skridt mod en fremtid som negletekniker eller i wellnessbranchen."},
    {"ss": [225, 226], "title": "Business & Event", "text": "Har du idéer, du gerne vil føre ud i livet? Her arbejder Fri Fagskolens Business & Event, og efterskolens valgfag Iværksætteri og SoMe hører til samme verden.", "more": {"label": "Læs om Business & Event", "text": "På Business & Event arbejder du med iværksætteri, idéudvikling, innovation, markedsføring og eventplanlægning, og du er med til at planlægge og afvikle alt fra små sammenkomster til store arrangementer og camps. Fri Fagskole er for 10. og 11. skoleår. Der gives ingen karakterer, og året slutter med en fagprøve og et fagbevis."}},
    {"ss": [202, 203, 204, 205], "title": "Hallen", "text": "Hallen er hjemsted for linjefaget håndbold og indendørs valgfag som basketball, futsal og volleyball. Du behøver ikke spille på eliteniveau, bare elske spillet.", "more": {"label": "Læs om håndbold og fodbold", "text": "På håndbold får du op til 4 haltræninger om ugen med teknik, taktik og videoanalyse. Halvorsminde stiller fælles hold med Hjørring Håndbold under navnet HH Halvor, og du kan tage dommerkort eller trænerkursus. På fodbold vælger du selv, om du træner 1 til 5 gange om ugen, og via Hjørring Fodbold Klub kan du spille i DBU Jyllands turnering. For de allerbedste er der et elitetilbud med Vendsyssel FF og deres U17 Divisionshold."}, "buttons": [{"label": "Se fodboldbanen", "room": "Fodboldbanen"}]},
    {"ss": [207], "title": "Her bliver du stærkere", "text": "Crossfit-lokalet er til dig, der vil udfordre kroppen. Valgfaget Crossfitness træner med funktionelle øvelser, og drømmer du om politi, forsvar eller beredskab, træner Fri Fagskolens FORCE styrke, kondition og udholdenhed."},
    {"ss": [211, 212, 213, 214], "title": "Fitness", "text": "Her træner linjefagene Fitness og Styrketræning med høj intensitet: interval, HIIT, tabata og funktionel træning. Der er maskiner og masser af vægte, og træningen tilpasses dit niveau.", "buttons": [{"label": "Se sauna og koldvandsbassin", "room": "Sauna og koldvandsbassin"}]},
  ],
  /** "Din plads venter" from the MPSkins tour's extended HTML - after 90 seconds. */
  nudge: {
    afterSeconds: 90,
    title: "Din plads venter",
    text: "Har du ikke været på besøg endnu? Kom og mærk stemningen selv. Har du allerede været her, så ved du, hvordan det føles, og næste skridt er at sikre dig en plads.",
    buttons: [
      { label: "Book en rundvisning", href: "https://halvorsminde.dk/aabent-hus/", primary: true },
      { label: "Meld dig ind", href: "https://halvorsminde.dk/nye-elever/meld-dig-ind/" },
    ],
  },
  mobileZoomLock: true,
  guide: { stops: [{ point: "vaerelse2" }, { point: "faellesrum" }, { point: "foredrag" }, { point: "gastro" }, { point: "metal" }, { point: "styling" }, { point: "fitness" }] },
  /** The MPSkins menu, as it is today. */
  menu: [
    { title: "Velkommen til Halvorsminde", href: u(2, "-3.13,-.15") },
    { title: "Skolen fra luften", href: "#luften" },
    { title: "Her bor du", items: [["2-mandsværelse", u(13, "-3.08,-.19")], ["3-mandsværelse", u(154, "3.13,.31")], ["4-mandsværelse", u(121, ".06,.72")]] },
    { title: "Din hverdag", items: [["Spisesalen", u(34, "-3.12,1.05")], ["Fællesrummet", u(105, "3.09,-1.1")], ["Pusterummet", u(82, "-2.91,-.8")], ["Foredragssalen", u(79, "-3.05,1.01")], ["Teatersalen", u(128, "-.02,.24")]] },
    { title: "Skoledagen", items: [["Klasselokalet", u(44, "-2.94,-.71")], ["Fysik-kemi", u(170, "-3.09,-.69")], ["Biblioteket", u(47, "-.12,-.82")]] },
    { title: "Værkstederne", items: [["Motor-metal", u(227, "-.05,.41")], ["Sløjd", u(246, "-.17,-1.08")], ["Styling", u(164, "-3.04,-.8")], ["Neglefabrikken", u(160, "-3,.87")], ["Business & event", u(225, "-2.49,1.41")], ["GastroFabrikken", u(127, "-.12,-.46")]] },
    { title: "Sport og bevægelse", items: [["Hallen", u(202, ".01,-.72")], ["Crossfit", u(207, "-.04,.85")], ["Fitness", u(211, "-.08,1.17")], ["Padel", "https://halvorsminde.dk/linjefag/padel/"], ["Ridning", "https://halvorsminde.dk/linjefag/ridning/"]] },
  ],
  /** MPSkins "Codes" as Matterport URL parameters: no help, autostart, no dollhouse/guided tour/highlight reel/floor/floor plan/VR buttons, no Matterport title or branding. */
  matterportParams: { play: "1", qs: "1", help: "0", dh: "0", gt: "0", hr: "0", f: "0", fp: "0", vr: "0", title: "0", brand: "0", mls: "0", search: "0" },
  /** MPSkins: Deep Link Transitions FLY, 800 ms. */
  flyMs: 800,
};
