/**
 * EAN (GLN) numbers - 13 digits, the last a GS1 check digit - used by public
 * institutions (e.g. efterskoler) to receive e-invoices via NemHandel.
 * Returns the clean number, or throws with what's wrong.
 */
export function normalizeEanNumber(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\s/g, "");
  if (!digits) return null;
  if (!/^\d{13}$/.test(digits)) throw new Error("EAN-nummeret skal være 13 cifre.");
  const sum = digits
    .slice(0, 12)
    .split("")
    .reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  const check = (10 - (sum % 10)) % 10;
  if (check !== Number(digits[12])) throw new Error("EAN-nummeret er ugyldigt - tjek cifrene (kontrolcifferet passer ikke).");
  return digits;
}

export type EanRecipient = { found: true; name: string | null } | { found: false };

/**
 * Whether an EAN can receive e-invoices: looked up in the public Peppol
 * directory, where Danish public institutions' NemHandel addresses are
 * listed (scheme 0088 = GLN/EAN). Only reads - nothing is sent. Null when
 * the directory couldn't be reached, so callers never block on it.
 */
export async function lookupEanRecipient(ean: string): Promise<EanRecipient | null> {
  try {
    const res = await fetch(
      `https://directory.peppol.eu/search/1.0/json?participant=iso6523-actorid-upis::0088:${encodeURIComponent(ean)}`,
      { next: { revalidate: 24 * 60 * 60 }, signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      "total-result-count"?: number;
      matches?: { entities?: { name?: { name?: string }[] }[] }[];
    };
    if (!data["total-result-count"]) return { found: false };
    return { found: true, name: data.matches?.[0]?.entities?.[0]?.name?.[0]?.name ?? null };
  } catch {
    return null;
  }
}
