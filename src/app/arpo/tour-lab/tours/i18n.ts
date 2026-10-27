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
  "Tilbage",
  "Tilbage til luften",
  "Menu",
  "Luk",
  "Luk menuen",
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
  "Fra {side}",
  "Oplev i 360°",
  "Se hele kortet",
  "Zoom ind",
] as const;

/** Keys whose values are never words to translate (links, ids, files, layout, code). */
const SKIP = new Set([
  "href", "url", "link", "tour", "pano", "image", "images", "logo", "favicon", "video", "poster", "audio", "src",
  "id", "slug", "key", "cat", "icon", "kind", "start", "startMobile", "tourPage", "modelId", "font", "fontHeading",
  "colors", "color", "customCss", "filter", "matterportParams", "hiddenSweeps", "linkOpen", "utm", "panos", "spots",
  "pattern", "flags", "embeds", "design", "navigation", "jump", "position", "go", "ss", "sr", "address", "mapUrl",
  "phone", "email", "instagram", "social", "translations", "languages", "zoom", "source", "wayfinding",
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
export function makeT(config: TourConfig, lang: string) {
  const dict = lang === "da" ? undefined : config.translations?.[lang];
  return (s: string, vars?: Record<string, string | number>) => {
    let out = dict?.[s] || s;
    if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
    return out;
  };
}

export type TourT = ReturnType<typeof makeT>;
