/*
 * Periods for the numbers ("Sidste 7 dage", "Denne måned" …), as days
 * "YYYY-MM-DD" in Danish time - shared by the date picker (in the browser)
 * and the pages that read a chosen period (on the server).
 */

export type Period = { preset: PresetKey; from: string; to: string };
export type PresetKey = "idag" | "igaar" | "7" | "30" | "uge" | "maaned" | "aar" | "egen";

export const PRESETS_EN: Record<PresetKey, string> = { idag: "Today", igaar: "Yesterday", "7": "Last 7 days", "30": "Last 30 days", uge: "This week", maaned: "This month", aar: "This year", egen: "Custom" };
export const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const PRESETS: [PresetKey, string][] = [
  ["idag", "I dag"],
  ["igaar", "I går"],
  ["7", "Sidste 7 dage"],
  ["30", "Sidste 30 dage"],
  ["uge", "Denne uge"],
  ["maaned", "Denne måned"],
  ["aar", "I år"],
  ["egen", "Brugerdefineret"],
];
export const MONTHS = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];

export const ymd = (d: Date) => d.toISOString().slice(0, 10);
export const at = (s: string) => new Date(`${s}T12:00:00Z`);
export const plus = (s: string, n: number) => {
  const d = at(s);
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
};
/** Today in Denmark. */
export function today(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Copenhagen" }).format(new Date());
}

/** A ready-made period's days, counted from today. */
export function presetPeriod(key: Exclude<PresetKey, "egen">, now = today()): Period {
  const d = at(now);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const range: Record<Exclude<PresetKey, "egen">, [string, string]> = {
    idag: [now, now],
    igaar: [plus(now, -1), plus(now, -1)],
    "7": [plus(now, -6), now],
    "30": [plus(now, -29), now],
    uge: [plus(now, -((d.getUTCDay() + 6) % 7)), plus(now, 6 - ((d.getUTCDay() + 6) % 7))],
    maaned: [ymd(new Date(Date.UTC(y, m, 1, 12))), ymd(new Date(Date.UTC(y, m + 1, 0, 12)))],
    aar: [`${y}-01-01`, `${y}-12-31`],
  };
  const [from, to] = range[key];
  return { preset: key, from, to };
}

const short = (s: string, lang: "da" | "en" = "da") => at(s).toLocaleDateString(lang === "en" ? "en-GB" : "da-DK", { day: "numeric", month: "short", timeZone: "UTC" });
/** "25. okt.–31. okt. 2026" (one day: "31. okt. 2026"). */
export function periodText(p: { from: string; to: string }, lang: "da" | "en" = "da"): string {
  const year = p.to.slice(0, 4);
  if (p.from === p.to) return `${short(p.from, lang)} ${year}`;
  return `${short(p.from, lang)}${p.from.slice(0, 4) !== year ? ` ${p.from.slice(0, 4)}` : ""}–${short(p.to, lang)} ${year}`;
}
export const presetName = (k: PresetKey, lang: "da" | "en" = "da") => (lang === "en" ? PRESETS_EN[k] : (PRESETS.find(([x]) => x === k)?.[1] ?? ""));

