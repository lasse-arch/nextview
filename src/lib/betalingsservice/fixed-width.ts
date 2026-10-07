/**
 * Fixed-width record helpers for Betalingsservice data deliveries
 * (Mastercard "Betalingsservice Guidelines for Data Suppliers - Automatic
 * payments and payment slips", 11 February 2025, chapter 4):
 *
 * - Every record is exactly 128 characters.
 * - Type X fields are alphanumeric, left aligned, padded with trailing spaces.
 * - Type N fields are numeric, right aligned, padded with leading zeros.
 * - Trailing spaces are removed from each record, and each ends with CR-LF.
 * - Files are encoded as ISO 8859-1.
 */

export const RECORD_LENGTH = 128;

export class BsFormatError extends Error {}

/** Type X: left aligned, trailing spaces. Throws if the value doesn't fit,
 * rather than silently cutting off e.g. a customer number. */
export function alpha(value: string, length: number, fieldName: string, { truncate = false } = {}): string {
  const v = value ?? "";
  if (v.length > length && !truncate) {
    throw new BsFormatError(`${fieldName} er for lang (${v.length} tegn, max ${length}): "${v}"`);
  }
  return v.slice(0, length).padEnd(length, " ");
}

/** Type N: right aligned, leading zeros. */
export function num(value: number | string, length: number, fieldName: string): string {
  const s = typeof value === "number" ? String(value) : value;
  if (!/^\d*$/.test(s)) throw new BsFormatError(`${fieldName} må kun indeholde cifre: "${s}"`);
  if (s.length > length) throw new BsFormatError(`${fieldName} er for lang (max ${length} cifre): "${s}"`);
  return s.padStart(length, "0");
}

/** Blank filler of the given length. */
export function blank(length: number): string {
  return " ".repeat(length);
}

/**
 * Joins a record's fields and checks it is exactly 128 characters - every
 * caller lists its fields straight from the spec's position table, so a
 * mismatch means a field width is wrong, which must never reach Mastercard.
 */
export function record(fields: string[], recordName: string): string {
  const line = fields.join("");
  if (line.length !== RECORD_LENGTH) {
    throw new BsFormatError(`Intern fejl: ${recordName} blev ${line.length} tegn i stedet for ${RECORD_LENGTH}`);
  }
  return line;
}

/** Characters ISO 8859-1 can't represent are replaced, so a stray emoji or
 * curly quote in a customer's name can't corrupt the file. */
export function toLatin1Safe(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\u0000-ÿ]/g, "?");
}

/** The finished file: trailing spaces removed per record, CR-LF line
 * endings, ISO 8859-1 bytes. */
export function encodeDelivery(records: string[]): Buffer {
  const text = records.map((r) => r.replace(/ +$/, "")).join("\r\n") + "\r\n";
  return Buffer.from(toLatin1Safe(text), "latin1");
}

/** Reads a delivery file received from Betalingsservice back into its
 * records (ISO 8859-1, CR-LF or LF), each padded back to 128 characters. */
export function decodeDelivery(file: Buffer | string): string[] {
  const text = typeof file === "string" ? file : file.toString("latin1");
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => line.padEnd(RECORD_LENGTH, " "));
}

/** 1-based inclusive positions, as written in the spec's tables. */
export function field(recordLine: string, from: number, to: number): string {
  return recordLine.slice(from - 1, to);
}

/** "15082026" (ddmmyyyy) or "150826" (ddmmyy) -> Date (UTC midnight). */
export function parseBsDate(raw: string): Date | null {
  const s = raw.trim();
  if (!/^\d+$/.test(s) || /^0+$/.test(s)) return null;
  let day: number, month: number, year: number;
  if (s.length === 8) {
    day = Number(s.slice(0, 2));
    month = Number(s.slice(2, 4));
    year = Number(s.slice(4, 8));
  } else if (s.length === 6) {
    day = Number(s.slice(0, 2));
    month = Number(s.slice(2, 4));
    year = 2000 + Number(s.slice(4, 6));
  } else {
    return null;
  }
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCMonth() === month - 1 ? d : null;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Date -> "ddmmyyyy" (Danish calendar day). */
export function formatBsDate8(date: Date): string {
  const parts = danishDateParts(date);
  return `${pad2(parts.day)}${pad2(parts.month)}${parts.year}`;
}

/** Date -> "ddmmyy" (Danish calendar day). */
export function formatBsDate6(date: Date): string {
  const parts = danishDateParts(date);
  return `${pad2(parts.day)}${pad2(parts.month)}${String(parts.year).slice(2)}`;
}

function danishDateParts(date: Date): { day: number; month: number; year: number } {
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Copenhagen", day: "2-digit", month: "2-digit", year: "numeric" });
  const [day, month, year] = fmt.format(date).split("/").map(Number);
  return { day, month, year };
}
