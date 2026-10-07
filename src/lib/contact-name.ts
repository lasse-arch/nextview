/**
 * A contract's signer has to be a real person: first name and last name,
 * letters only (hyphens, apostrophes and a middle initial's dot allowed,
 * e.g. "Anne-Marie K. O'Hara"). Returns what's wrong, or null when fine.
 */
export function contactNameProblem(name: string | null | undefined): string | null {
  const normalized = (name ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) return "Udfyld kontaktperson.";
  if (!/^\p{L}[\p{L} .'-]*$/u.test(normalized)) return "Kontaktperson må kun indeholde bogstaver.";
  const names = normalized.split(" ").filter((word) => /\p{L}{2,}/u.test(word));
  if (names.length < 2) return "Kontaktperson skal være både fornavn og efternavn.";
  return null;
}
