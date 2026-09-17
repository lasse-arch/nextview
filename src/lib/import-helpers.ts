export type ParsedRow = Record<string, string>;

export function normalizeKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9æøå]+/g, "");
}

/**
 * Parses a money-ish cell value that may carry Danish formatting (dot as
 * thousand-separator, comma as decimal - "2.500,50") or US/spreadsheet
 * formatting (comma as thousand-separator, dot as decimal - "2,500.50"),
 * plus a "kr" suffix and spaces. Returns null if nothing numeric could be
 * extracted.
 */
export function parseAmount(raw: string): number | null {
  let cleaned = raw
    .replace(/kr\.?/gi, "")
    .replace(/\s+/g, "")
    .trim();
  if (!cleaned) return null;

  const hasDot = cleaned.includes(".");
  const hasComma = cleaned.includes(",");

  if (hasDot && hasComma) {
    // Whichever separator comes last is the decimal separator; the other is thousands.
    if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (hasComma) {
    // Only commas: thousand-separator if every group is exactly 3 digits (e.g. "2,500"), else decimal.
    cleaned = /^\d{1,3}(,\d{3})+$/.test(cleaned) ? cleaned.replace(/,/g, "") : cleaned.replace(",", ".");
  } else if (hasDot) {
    if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) cleaned = cleaned.replace(/\./g, "");
  }

  const value = parseFloat(cleaned);
  return isNaN(value) ? null : Math.round(value);
}

/**
 * Parses a date cell as Danish dd/mm/yyyy (also accepts "-" or "." as the
 * separator) - never the native `new Date(string)` constructor, which
 * silently guesses US mm/dd/yyyy for ambiguous slash-separated dates and
 * has caused wrong billing/live dates on import. ISO "yyyy-mm-dd" is also
 * accepted since it's unambiguous regardless of locale. Returns null
 * (rather than a garbage date) for anything else, so callers can skip/flag
 * the row instead of importing a silently wrong date.
 */
export function parseDanishDate(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const [, y, m, d] = iso;
    return toValidDate(Number(y), Number(m), Number(d));
  }

  const dmy = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (dmy) {
    const [, d, m, yRaw] = dmy;
    const y = yRaw.length === 2 ? 2000 + Number(yRaw) : Number(yRaw);
    return toValidDate(y, Number(m), Number(d));
  }

  return null;
}

function toValidDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  // Guards against JS rolling e.g. 31/04 over into May.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

export function pick(row: ParsedRow, ...candidates: string[]): string | null {
  const normalized: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) {
    normalized[normalizeKey(k)] = v;
  }
  for (const candidate of candidates) {
    const value = normalized[normalizeKey(candidate)];
    if (value && value.trim()) return value.trim();
  }
  return null;
}
