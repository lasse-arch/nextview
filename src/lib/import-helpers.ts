export type ParsedRow = Record<string, string>;

export function normalizeKey(key: string): string {
  return key.trim().toLowerCase().replace(/[\s_-]+/g, "");
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
