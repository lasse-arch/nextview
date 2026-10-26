/*
 * The icons for points on the drone picture and the interactive map - shared
 * by the tour and the editor's icon picker. Each is the inside of a 24×24
 * line-icon svg (stroke, no fill).
 */
export const ICONS: Record<string, string> = {
  seng: '<path d="M3 18v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5M3 18v2M21 18v2M3 13h18M6 11V9a2 2 0 0 1 2-2h3"/>',
  mad: '<path d="M7 3v8a2 2 0 0 0 2 2v8M5 3v5M9 3v5M17 3c-2 0-3 2-3 5s1 4 3 4v9"/>',
  sofa: '<path d="M4 11V8a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v3M3 11h18v6H3zM6 17v2M18 17v2"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4"/>',
  skrue: '<path d="M14 7l3-3 3 3-3 3M14 7l-8 8-3 3 3-3M14 7l-2 2"/><path d="M9 12l3 3"/>',
  hammer: '<path d="M14 6l4 4M12 8l-7 7a2 2 0 0 0 3 3l7-7M14 4l6 6-2 2-6-6z"/>',
  saks: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M8 7l12 10M8 17L20 7"/>',
  hal: '<path d="M3 11l9-7 9 7v9H3z"/><path d="M9 20v-5h6v5M3 11h18"/>',
  loeft: '<path d="M4 10h16M7 7v6M17 7v6M4 10V8M20 10V8M12 4v16"/>',
  bold: '<circle cx="12" cy="12" r="9"/><path d="M12 7l4 3-1.5 4.5h-5L8 10z"/>',
  skov: '<path d="M12 3l5 7h-3l4 6H6l4-6H7z"/><path d="M12 16v5"/>',
  sauna: '<path d="M4 20h16M6 20v-7a6 6 0 0 1 12 0v7M9 8s1-2 0-4M15 8s1-2 0-4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  stjerne: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  indgang: '<path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M14 16l4-4-4-4M18 12H9"/>',
  parkering: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M10 17V7h3.5a3 3 0 0 1 0 6H10"/>',
  wc: '<path d="M7 4v.5M17 4v.5M5 8h4l-1 6H6zM7 14v6M15 8h4v6h-1v6h-2v-6h-1z"/>',
  bad: '<path d="M4 12h16v3a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM6 12V6a2 2 0 0 1 4 0M7 20l-1 1M17 20l1 1"/>',
  kontor: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>',
  bog: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M8 7h7"/>',
  musik: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  kunst: '<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5S14 15 15 15h2a4 4 0 0 0 4-4c0-4.4-4-8-9-8z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
  computer: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  kaffe: '<path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 11h1.5a2.5 2.5 0 0 1 0 5H17M8 3v3M12 3v3"/>',
  hjerte: '<path d="M12 20s-7-4.5-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.5-9 9-9 9z"/>',
  hus: '<path d="M4 11l8-6 8 6M6 10v10h12V10M10 20v-5h4v5"/>',
  telt: '<path d="M3 20L12 4l9 16zM12 4v16M9 20l3-5 3 5"/>',
  baal: '<path d="M12 3c3 4 5 6 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-8z"/><path d="M5 21l14-3M19 21L5 18"/>',
  svoem: '<path d="M2 18c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5M8 14l3-7 5 3M16 6.5a1.5 1.5 0 1 0 0-.01"/>',
  hest: '<path d="M6 21v-6l-2-3 3-5 4-2 5 1 3 4v3l-3-1-2 3v6M10 7l-1-3"/>',
  traktor: '<circle cx="7" cy="16" r="4"/><circle cx="18" cy="17" r="3"/><path d="M7 12V6h6l2 5h4v3M11 16h4"/>',
  legeplads: '<path d="M4 21V5l8-2 8 2v16M4 9h16M8 21v-6h8v6M12 3v6"/>',
  cykel: '<circle cx="6" cy="16" r="4"/><circle cx="18" cy="16" r="4"/><path d="M6 16l4-8h5l3 8M10 8l2 8h-6M14 5h2"/>',
  bil: '<path d="M5 16h14v-4l-2-5H7l-2 5zM5 16v2M19 16v2M5 12h14"/><circle cx="8" cy="16" r="1"/><circle cx="16" cy="16" r="1"/>',
  udsigt: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  kamera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  butik: '<path d="M4 9l1-5h14l1 5M4 9v11h16V9M4 9a3 3 0 0 0 5 0 3 3 0 0 0 6 0 3 3 0 0 0 5 0M10 20v-5h4v5"/>',
  noegle: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l2 2M15 8l2 2"/>',
  golf: '<path d="M12 18V3l6 3-6 3"/><ellipse cx="12" cy="19" rx="6" ry="2"/>',
  strand: '<path d="M12 3a8 8 0 0 1 8 8H4a8 8 0 0 1 8-8zM12 11l3 10M2 21h20"/>',
  stik: '<path d="M9 2v6M15 2v6M7 8h10v3a5 5 0 0 1-10 0zM12 16v6"/>',
  plads: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 12h16M12 4v16"/>',
  autocamper: '<path d="M3 13h12V7H3zM15 10h3l3 3v3h-6zM6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>',
  koekken: '<path d="M4 11h16v7a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3zM2 11h2M20 11h2M9 7c0-1 1-1.5 1-3M13 7c0-1 1-1.5 1-3"/>',
};

/** The icons' names in the editor (Danish). */
export const ICON_NAMES: Record<string, string> = {
  info: "Info", pin: "Sted", stjerne: "Stjerne", seng: "Værelse", sofa: "Fællesrum", mad: "Mad", kaffe: "Café", mic: "Scene / foredrag",
  musik: "Musik", kunst: "Kunst", bog: "Bibliotek / læring", computer: "IT", kontor: "Kontor", skrue: "Værksted", hammer: "Sløjd", saks: "Frisør / styling",
  hal: "Hal", loeft: "Fitness", bold: "Boldbane", svoem: "Svømning", sauna: "Sauna", bad: "Bad", wc: "Toilet", skov: "Natur",
  baal: "Bål", telt: "Telt", hus: "Hus / hytte", legeplads: "Legeplads", hest: "Heste", traktor: "Landbrug", cykel: "Cykel", bil: "Bil",
  parkering: "Parkering", indgang: "Indgang", udsigt: "Udsigt", kamera: "Foto", butik: "Butik", noegle: "Udlejning", hjerte: "Favorit",
};

/** A good icon for a place, guessed from its name (when a point is made from the menu). */
export function guessIcon(name: string): string {
  const n = name.toLowerCase();
  const rules: [RegExp, string][] = [
    [/værelse|vaerelse|seng|sove|bo\b|hytte|lejlighed/, "seng"],
    [/spise|køkken|koekken|kantine|restaurant|mad|gastro/, "mad"],
    [/café|cafe|kaffe/, "kaffe"],
    [/fællesrum|faellesrum|opholds|lounge|stue/, "sofa"],
    [/foredrag|scene|sal\b|morgensang|aula/, "mic"],
    [/musik|band|øvelokale/, "musik"],
    [/kunst|kreativ|maling|keramik|design/, "kunst"],
    [/bibliotek|klasse|undervis|lektie|læring/, "bog"],
    [/it\b|medie|computer|gaming|e-sport/, "computer"],
    [/kontor|administration|forstander|reception/, "kontor"],
    [/motor|metal|mekanik|værksted|vaerksted/, "skrue"],
    [/sløjd|sloejd|træ\b|byg/, "hammer"],
    [/styling|frisør|frisor|hår/, "saks"],
    [/hal\b|hallen|idræt|idraet|gymnastik|sport/, "hal"],
    [/fitness|styrke|træning|traening/, "loeft"],
    [/fodbold|bold|bane|volley|padel|tennis/, "bold"],
    [/svøm|svoem|pool|bad\b|strand|sø\b/, "svoem"],
    [/sauna/, "sauna"],
    [/toilet|wc/, "wc"],
    [/skov|natur|park|have/, "skov"],
    [/bål|baal|shelter/, "baal"],
    [/telt|camping|plads/, "telt"],
    [/legeplads|leg\b/, "legeplads"],
    [/hest|ridning|stald/, "hest"],
    [/landbrug|gård|gaard|dyr/, "traktor"],
    [/parkering|p-plads/, "parkering"],
    [/indgang|ankomst|velkommen/, "indgang"],
    [/butik|shop|kiosk/, "butik"],
    [/udsigt|tårn/, "udsigt"],
  ];
  return rules.find(([re]) => re.test(n))?.[1] ?? "pin";
}
