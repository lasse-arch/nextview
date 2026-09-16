export type ParsedRow = Record<string, string>;

export function normalizeKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9æøå]+/g, "");
}

/**
 * Parses a money-ish cell value that may carry Danish formatting - a "kr"
 * suffix, thousand-separator dots, spaces - into a plain number. Returns
 * null if nothing numeric could be extracted.
 */
export function parseAmount(raw: string): number | null {
  const cleaned = raw
    .replace(/kr\.?/gi, "")
    .replace(/\s+/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
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
