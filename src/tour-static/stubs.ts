/*
 * What the tour engine imports but a published tour (plain files, no Arpo
 * behind it) must never contain: Arpo's server functions and Next's router.
 * The build (scripts/build-tour-engine.mjs) swaps these in, so no server
 * code - and nothing that could reach the database - ends up in a public file.
 */
const off = async () => ({ ok: false as const, error: "Ikke i en udgivet tour." });
export const saveTourStoryImage = off;
export function useRouter() {
  return { refresh() {}, push() {}, replace() {}, back() {}, prefetch() {} };
}
