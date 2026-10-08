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
