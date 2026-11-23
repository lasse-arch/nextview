import { formatDKK } from "@/lib/labels";

const MONTHS = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const MONTHS_LONG = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];

/** "2027-03" → "mar". */
export const monthShort = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym;
/** "2027-03" → "marts". */
export const monthLong = (ym: string) => MONTHS_LONG[Number(ym.slice(5, 7)) - 1] ?? ym;

/** A count the forecast gives as an expected value - whole numbers, one decimal under 10. */
export function count(n: number): string {
  const r = Math.abs(n) < 10 ? Math.round(n * 10) / 10 : Math.round(n);
  return r.toLocaleString("da-DK", { maximumFractionDigits: 1 });
}

export const kr = (n: number) => formatDKK(Math.round(n));

/** "1,2 mio." / "840.000" - for the short figures on the cards. */
export function krShort(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toLocaleString("da-DK", { maximumFractionDigits: 1 })} mio. kr.`;
  return formatDKK(Math.round(n));
}

export const ymNow = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
