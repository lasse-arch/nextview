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
