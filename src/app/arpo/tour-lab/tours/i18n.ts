import type { TourConfig } from "./types";

/*
 * A tour in more languages. A setup is written in Danish; `translations`
 * holds, per language, Danish text -> that language - for the setup's own
 * texts and for the engine's fixed words (UI_STRINGS: "Vis mig rundt",
 * "Luk" …), so nextviewAI translates the lot in one go and any language
 * works. The same Danish text always becomes the same words, so everything
 * in the setup that finds things by name still matches up. What reaches
 * outside the setup (statistics, ?rum= links, story pictures, live units)
 * keeps the Danish names - the tour's numbers stay one set in every language.
 */

export const LANGUAGES = [
  { code: "da", name: "Dansk", flag: "🇩🇰" },
  { code: "en", name: "English", flag: "🇬🇧" },
  { code: "de", name: "Deutsch", flag: "🇩🇪" },
  { code: "sv", name: "Svenska", flag: "🇸🇪" },
  { code: "nb", name: "Norsk", flag: "🇳🇴" },
  { code: "nl", name: "Nederlands", flag: "🇳🇱" },
  { code: "fr", name: "Français", flag: "🇫🇷" },
  { code: "es", name: "Español", flag: "🇪🇸" },
  { code: "it", name: "Italiano", flag: "🇮🇹" },
  { code: "pl", name: "Polski", flag: "🇵🇱" },
  { code: "kl", name: "Kalaallisut", flag: "🇬🇱" },
] as const;

export type LangCode = (typeof LANGUAGES)[number]["code"];
export const langName = (code: string) => LANGUAGES.find((l) => l.code === code)?.name ?? code;

/** The engine's own words, as written in the code - `{x}` is filled in at runtime and must stay in a translation. */
export const UI_STRINGS = [
  "Skriv til os",
  "Navn",
  "E-mail",
  "Telefon",
  "Besked",
  "Udfyld navn, e-mail og besked.",
  "Formularen virker ikke lige nu.",
  "Sendt fra den virtuelle tour",
  "Send beskeden",
  "Din besked er skrevet færdig. Vælg, hvordan du vil sende den - så trykker du bare Send.",
  "Mail på enheden",
  "Kopiér beskeden",
  "Kopieret",
  "Indsæt den i en mail til",
  "Mailen går til",
  "Ret beskeden",
  "Tilbage til touren",
  "Sådan går du rundt",
  "Træk i billedet for at se dig omkring",
  "Tryk på de hvide cirkler for at gå hen til dem",
  "Åbn menuen for at hoppe direkte til et sted",
  "Forstået",
  "Gå ind i touren",
  "Tilbage",
  "Tilbage til luften",
  "Menu",
  "Luk",
  "Luk menuen",
  "Alle områder",
  "Vis mig rundt",
  "Træd indenfor",
  "Gå ind",
  "Gå ind i rummet",
  "Går ind…",
  "Fortsæt hvor du slap",
  "Anbefalet",
  "Kontakt",
  "Kort",
  "Ledig",
  "Book",
  "Find vej",
  "Historier",
  "Afspil",
  "Fra luften",
  "Fortsæt",
  "Pause",
  "Næste",
  "Forrige",
  "Næste ›",
  "Næste: {sted}",
  "På pause - du kigger selv rundt",
  "Træk i billedet for at se dig omkring, og tryk for at gå - guiden venter på dig.",
  "Afslut",
  "Hør igen",
  "Slå lyd til",
  "Slå lyd fra",
  "Sådan ser en dag ud",
  "Se stedet",
  "Her nu",
  "Se hele dagen",
  "Bagefter: {tid}",
  "Du er her",
  "Søg…",
  "Læs mere",
  "Steder",
  "Skift rum ▴",
  "Ledig nu",
  "Ledig fra {dato}",
  "Book #{nr}",
  "{antal} ledige i denne størrelse, fra {pris} kr./md.",
  "Ingen ledige i denne størrelse lige nu",
  "Vis mål",
  "Skjul mål",
  "Tryk på et sted for at se mere - eller gå direkte ind.",
  "Tilbage til kortet",
  "Vis",
  "Sprog",
  "Åbn i ny fane ↗",
  "Bliver siden ved med at spørge om cookies? Åbn den i en ny fane.",
  "Fra {side}",
  "Oplev i 360°",
  "Se hele kortet",
  "Zoom ind",
  "{n} steder, ca. {min} min",
  "Præsenteret af",
  "Spring over",
  "Tilbage til 360°-billedet",
  "Vælg hvor du skal hen - så går touren vejen derhen fra der, hvor du står.",
  "Søg rum eller boksnummer…",
  "Ingen fundet - prøv et boksnummer, fx 160.",
  "Ingen fundet.",
  "Du er fremme",
  "På vej: {n} af {m}",
  "Stop",
  "Start rundturen",
  "Skjul rumvælgeren",
  "Zoom ud",
  "Stoppet",
  "Åbn i Google Maps",
  "Vælg et rum - touren går vejen derhen",
  "Træk for at se hele billedet",
  "Se hele billedet",
  "Fyld skærmen",
  "Hvor langt har du til os?",
  "Find din vej til",
  "Din adresse eller dit postnummer",
  "Finder vejen …",
  "Kunne ikke finde vejen lige nu - prøv igen.",
  "Fra",
  "I bil",
  "På cykel",
  "Til fods",
  "Vi mødes kl.",
  "Se hvilken bus eller hvilket tog du skal tage - Google Maps finder den bedste rejse.",
  "Se rejsen med bus og tog",
  "Tiderne er cirka. Din adresse gemmes ikke.",
] as const;

/** Keys whose values are never words to translate (links, ids, files, layout, code). */
const SKIP = new Set([
  "href", "url", "link", "tour", "pano", "image", "images", "logo", "favicon", "video", "poster", "audio", "src",
  "id", "slug", "key", "cat", "icon", "kind", "start", "startMobile", "tourPage", "modelId", "font", "fontHeading",
  "colors", "color", "customCss", "filter", "matterportParams", "hiddenSweeps", "linkOpen", "utm", "panos", "spots",
  "pattern", "flags", "embeds", "design", "navigation", "jump", "position", "go", "ss", "sr", "address", "mapUrl",
  "phone", "email", "instagram", "social", "translations", "languages", "zoom", "source", "wayfinding", "audioText", "voice",
]);

/** A string that is words for people - not a link, a path, a colour or an id. */
const isText = (s: string) =>
  /\p{L}/u.test(s) && !/^(https?:|mailto:|tel:|\/|#|data:)/i.test(s.trim()) && !/^[a-z0-9_.:-]+$/.test(s.trim());

/** Every text in a setup that a translation should cover, plus the engine's own words. */
export function translatableTexts(config: TourConfig): string[] {
  const out = new Set<string>();
  const walk = (v: unknown, key?: string) => {
    if (key && SKIP.has(key)) return;
    if (typeof v === "string") {
      if (isText(v)) out.add(v.trim());
    } else if (Array.isArray(v)) v.forEach((x) => walk(x));
    else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) walk(x, k);
      // The room picker's size groups are keyed by their (menu) names.
      if (key === "ranges") Object.keys(v).forEach((k) => isText(k) && out.add(k));
    }
  };
  walk(config);
  UI_STRINGS.forEach((s) => out.add(s));
  return [...out];
}

/**
 * Words as a person writes them: no "·" between words, no long dashes (— –)
 * and no "|" as separators - "Bramming · siden 1897" becomes "Bramming, siden
 * 1897". Visitors read those as machine-made text.
 */
export function plainWords(s: string): string {
  return s
    .replace(/\s+[·•|]\s+/g, ", ")
    .replace(/^\s*[·•]\s*|\s*[·•]\s*$/g, "")
    .replace(/\s*[—–]\s*/g, " - ");
}

/** Every text in a setup (and its translations) through plainWords - links, ids, CSS and the like are left alone. */
export function plainWordsInConfig(config: TourConfig): TourConfig {
  const walk = (v: unknown, key?: string): unknown => {
    if (key === "translations" && v && typeof v === "object") {
      return Object.fromEntries(
        Object.entries(v as Record<string, Record<string, string>>).map(([lang, dict]) => [
          lang,
          Object.fromEntries(Object.entries(dict).map(([da, x]) => [plainWords(da), plainWords(x)])),
        ])
      );
    }
    if (key && SKIP.has(key)) return v;
    if (typeof v === "string") return isText(v) ? plainWords(v) : v;
    if (Array.isArray(v)) return v.map((x) => walk(x));
    if (v && typeof v === "object") {
      const o: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) o[key === "ranges" && isText(k) ? plainWords(k) : k] = walk(x, k);
      return o;
    }
    return v;
  };
  return walk(config) as TourConfig;
}

/** The languages a setup can be shown in (Danish first). */
export const tourLanguages = (config: TourConfig): string[] => ["da", ...(config.languages ?? []).filter((l) => l !== "da")];

/**
 * The setup as shown in `lang`: every text with a translation swapped, the
 * rest left in Danish. Voices (audio) are Danish, so another language goes
 * without them. Danish (or a language without translations) is the setup as is.
 */
export function localize(config: TourConfig, lang: string): TourConfig {
  const dict = config.translations?.[lang];
  if (lang === "da" || !dict) return config;
  const tr = (s: string) => dict[s.trim()] || s;
  // Parts without anything to translate are kept as the same objects, so nothing that depends on them starts over.
  const walk = (v: unknown, key?: string): unknown => {
    if (key === "audio") return undefined;
    if (key && SKIP.has(key)) return v;
    if (typeof v === "string") return isText(v) ? tr(v) : v;
    if (Array.isArray(v)) {
      const out = v.map((x) => walk(x));
      return out.some((x, i) => x !== v[i]) ? out : v;
    }
    if (v && typeof v === "object") {
      let changed = false;
      const o: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) {
        const nk = key === "ranges" && isText(k) ? tr(k) : k;
        o[nk] = walk(x, k);
        if (nk !== k || o[nk] !== x) changed = true;
      }
      return changed ? o : v;
    }
    return v;
  };
  return walk(config) as TourConfig;
}

/** Translated text -> the Danish it came from (for statistics and lookups that must stay Danish). */
export function danishOf(config: TourConfig, lang: string): (s: string) => string {
  const dict = config.translations?.[lang];
  if (lang === "da" || !dict) return (s) => s;
  const back = new Map(Object.entries(dict).map(([da, x]) => [x, da]));
  return (s) => back.get(s) ?? s;
}

/** The engine's words in the tour's language: t("Ledig fra {dato}", { dato: "1/5" }). */
/**
 * The engine's own newer words, ready in the common languages - so a tour
 * translated before they came still shows them in its language (the tour's
 * own translation wins when it has one).
 */
const BUILT_IN: Record<string, Record<string, string>> = {
  en: {
    "Åbn i Google Maps": "Open in Google Maps",
    "Vælg et rum - touren går vejen derhen": "Choose a room - the tour walks you there",
    "Træk for at se hele billedet": "Drag to see the whole picture", "Se hele billedet": "See the whole picture", "Fyld skærmen": "Fill the screen",
    "Hvor langt har du til os?": "How far do you live from us?", "Find din vej til": "Find your way to", "Din adresse eller dit postnummer": "Your address or postcode", "Finder vejen …": "Finding the way …", "Kunne ikke finde vejen lige nu - prøv igen.": "Couldn't find the way right now - try again.", "Fra": "From", "I bil": "By car", "På cykel": "By bike", "Til fods": "On foot", "Vi mødes kl.": "We meet at", "Se hvilken bus eller hvilket tog du skal tage - Google Maps finder den bedste rejse.": "See which bus or train to take - Google Maps finds the best journey.", "Se rejsen med bus og tog": "See the journey by bus and train", "Tiderne er cirka. Din adresse gemmes ikke.": "Times are approximate. Your address is not saved.",
    "Vis mig rundt": "Show me around", "{n} steder, ca. {min} min": "{n} places, about {min} min", "Start rundturen": "Start the tour", "Find vej": "Find your way",
    "Vælg hvor du skal hen - så går touren vejen derhen fra der, hvor du står.": "Choose where to go - the tour walks you there from where you are.",
    "Søg rum eller boksnummer…": "Search a room or unit number…", "Søg…": "Search…", "Ingen fundet - prøv et boksnummer, fx 160.": "Nothing found - try a unit number, e.g. 160.", "Ingen fundet.": "Nothing found.",
    "Du er fremme": "You have arrived", "På vej: {n} af {m}": "On the way: {n} of {m}", Stoppet: "Stopped", Stop: "Stop", Luk: "Close", "Læs mere": "Read more", Tilbage: "Back",
    "Præsenteret af": "Presented by", "Spring over": "Skip", "Tilbage til 360°-billedet": "Back to the 360° view", "Tilbage til luften": "Back to the aerial view",
    "Tryk på et sted for at se mere - eller gå direkte ind.": "Tap a place to see more - or go straight in.", Pause: "Pause", Fortsæt: "Continue", Næste: "Next", Forrige: "Previous",
    "Zoom ind": "Zoom in", "Zoom ud": "Zoom out", "Skjul rumvælgeren": "Hide the room picker",
  },
  de: {
    "Åbn i Google Maps": "In Google Maps öffnen",
    "Vælg et rum - touren går vejen derhen": "Raum wählen - die Tour führt Sie hin",
    "Træk for at se hele billedet": "Ziehen, um das ganze Bild zu sehen", "Se hele billedet": "Ganzes Bild ansehen", "Fyld skærmen": "Bildschirm füllen",
    "Hvor langt har du til os?": "Wie weit haben Sie zu uns?", "Find din vej til": "Finden Sie Ihren Weg zu", "Din adresse eller dit postnummer": "Ihre Adresse oder Postleitzahl", "Finder vejen …": "Weg wird gesucht …", "Kunne ikke finde vejen lige nu - prøv igen.": "Der Weg konnte gerade nicht gefunden werden - bitte erneut versuchen.", "Fra": "Von", "I bil": "Mit dem Auto", "På cykel": "Mit dem Rad", "Til fods": "Zu Fuß", "Vi mødes kl.": "Treffpunkt um", "Se hvilken bus eller hvilket tog du skal tage - Google Maps finder den bedste rejse.": "Sehen Sie, welchen Bus oder Zug Sie nehmen - Google Maps findet die beste Verbindung.", "Se rejsen med bus og tog": "Verbindung mit Bus und Bahn ansehen", "Tiderne er cirka. Din adresse gemmes ikke.": "Die Zeiten sind ungefähr. Ihre Adresse wird nicht gespeichert.",
    "Vis mig rundt": "Zeig mir alles", "{n} steder, ca. {min} min": "{n} Orte, ca. {min} Min.", "Start rundturen": "Rundgang starten", "Find vej": "Weg finden",
    "Vælg hvor du skal hen - så går touren vejen derhen fra der, hvor du står.": "Wählen Sie, wohin Sie möchten - die Tour führt Sie von Ihrem Standort dorthin.",
    "Søg rum eller boksnummer…": "Raum oder Nummer suchen…", "Søg…": "Suchen…", "Ingen fundet - prøv et boksnummer, fx 160.": "Nichts gefunden - versuchen Sie eine Nummer, z. B. 160.", "Ingen fundet.": "Nichts gefunden.",
    "Du er fremme": "Sie sind angekommen", "På vej: {n} af {m}": "Unterwegs: {n} von {m}", Stoppet: "Angehalten", Stop: "Stopp", Luk: "Schließen", "Læs mere": "Mehr lesen", Tilbage: "Zurück",
    "Præsenteret af": "Präsentiert von", "Spring over": "Überspringen", "Tilbage til 360°-billedet": "Zurück zum 360°-Bild", "Tilbage til luften": "Zurück zur Luftansicht",
    "Tryk på et sted for at se mere - eller gå direkte ind.": "Tippen Sie auf einen Ort, um mehr zu sehen - oder gehen Sie direkt hinein.", Pause: "Pause", Fortsæt: "Weiter", Næste: "Weiter", Forrige: "Zurück",
    "Zoom ind": "Vergrößern", "Zoom ud": "Verkleinern", "Skjul rumvælgeren": "Raumauswahl ausblenden",
  },
  sv: {
    "Åbn i Google Maps": "Öppna i Google Maps",
    "Vælg et rum - touren går vejen derhen": "Välj ett rum - turen visar vägen dit",
    "Træk for at se hele billedet": "Dra för att se hela bilden", "Se hele billedet": "Se hela bilden", "Fyld skærmen": "Fyll skärmen",
    "Hvor langt har du til os?": "Hur långt har du till oss?", "Find din vej til": "Hitta vägen till", "Din adresse eller dit postnummer": "Din adress eller ditt postnummer", "Finder vejen …": "Hittar vägen …", "Kunne ikke finde vejen lige nu - prøv igen.": "Kunde inte hitta vägen just nu - försök igen.", "Fra": "Från", "I bil": "Med bil", "På cykel": "Med cykel", "Til fods": "Till fots", "Vi mødes kl.": "Vi träffas kl.", "Se hvilken bus eller hvilket tog du skal tage - Google Maps finder den bedste rejse.": "Se vilken buss eller vilket tåg du ska ta - Google Maps hittar den bästa resan.", "Se rejsen med bus og tog": "Se resan med buss och tåg", "Tiderne er cirka. Din adresse gemmes ikke.": "Tiderna är ungefärliga. Din adress sparas inte.",
    "Vis mig rundt": "Visa mig runt", "{n} steder, ca. {min} min": "{n} platser, ca. {min} min", "Start rundturen": "Starta rundturen", "Find vej": "Hitta vägen",
    "Du er fremme": "Du är framme", "På vej: {n} af {m}": "På väg: {n} av {m}", Stoppet: "Stoppad", Luk: "Stäng", "Læs mere": "Läs mer", Tilbage: "Tillbaka", "Præsenteret af": "Presenteras av", "Spring over": "Hoppa över",
    "Tilbage til 360°-billedet": "Tillbaka till 360°-bilden", "Tilbage til luften": "Tillbaka till flygbilden", Fortsæt: "Fortsätt", Næste: "Nästa", Forrige: "Föregående",
  },
  nb: {
    "Åbn i Google Maps": "Åpne i Google Maps",
    "Vælg et rum - touren går vejen derhen": "Velg et rom - turen viser veien dit",
    "Træk for at se hele billedet": "Dra for å se hele bildet", "Se hele billedet": "Se hele bildet", "Fyld skærmen": "Fyll skjermen",
    "Hvor langt har du til os?": "Hvor langt har du til oss?", "Find din vej til": "Finn veien til", "Din adresse eller dit postnummer": "Din adresse eller ditt postnummer", "Finder vejen …": "Finner veien …", "Kunne ikke finde vejen lige nu - prøv igen.": "Kunne ikke finne veien akkurat nå - prøv igjen.", "Fra": "Fra", "I bil": "Med bil", "På cykel": "På sykkel", "Til fods": "Til fots", "Vi mødes kl.": "Vi møtes kl.", "Se hvilken bus eller hvilket tog du skal tage - Google Maps finder den bedste rejse.": "Se hvilken buss eller hvilket tog du skal ta - Google Maps finner den beste reisen.", "Se rejsen med bus og tog": "Se reisen med buss og tog", "Tiderne er cirka. Din adresse gemmes ikke.": "Tidene er omtrentlige. Adressen din lagres ikke.",
    "Vis mig rundt": "Vis meg rundt", "{n} steder, ca. {min} min": "{n} steder, ca. {min} min", "Start rundturen": "Start omvisningen", "Find vej": "Finn veien",
    "Du er fremme": "Du er fremme", "På vej: {n} af {m}": "På vei: {n} av {m}", Stoppet: "Stoppet", Luk: "Lukk", "Læs mere": "Les mer", Tilbage: "Tilbake", "Præsenteret af": "Presentert av", "Spring over": "Hopp over",
    "Tilbage til 360°-billedet": "Tilbake til 360°-bildet", "Tilbage til luften": "Tilbake til luftfotoet", Fortsæt: "Fortsett", Næste: "Neste", Forrige: "Forrige",
  },
};

export function makeT(config: TourConfig, lang: string) {
  const dict = lang === "da" ? undefined : config.translations?.[lang];
  const builtIn = lang === "da" ? undefined : BUILT_IN[lang];
  return (s: string, vars?: Record<string, string | number>) => {
    let out = dict?.[s] || builtIn?.[s] || s;
    if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
    return out;
  };
}

export type TourT = ReturnType<typeof makeT>;

/**
 * "i" or "på" before a place in Danish: på for places you're on - a camp
 * site, a school, a farm, a beach, an island (Fanø, Bornholm …) - else i (i Hals,
 * i København). "Vejret på Hals Strand Camping", "Vejret i Hals".
 */
export function iEllerPaa(place: string): "i" | "på" {
  const p = place.trim().toLowerCase();
  if (/(camping|campingplads|skole|efterskole|højskole|gård|gaard|strand|havn|hotel|kro|slot|museum|marina|ferieby|feriecenter|centret|centeret)\b/.test(p)) return "på";
  if (/^(bornholm|fanø|rømø|læsø|samsø|ærø|langeland|mors|fyn|als|lolland|falster|møn|anholt|sjælland|amager|tåsinge|ærø|endelave|livø|venø|fur|thurø|omø|agersø|askø|femø|fejø|mandø|egholm|hjarnø|tunø|sejerø|nekselø|orø|strynø|drejø|avernakø|lyø|bjørnø|hjortø|skarø|fænø)$/.test(p)) return "på";
  return "i";
}
