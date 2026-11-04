"use server";

import { requireTour } from "@/lib/auth";
import { linkAlternates } from "@/lib/link-alternates";

/* "Find dem på hjemmesiden" under Sprog → Links pr. sprog (see link-alternates.ts). */
export async function findLinkTranslations(
  slug: string,
  links: string[],
  langs: string[],
): Promise<{ ok: true; found: Record<string, Record<string, string>>; read: number; failed: number } | { ok: false; error: string }> {
  await requireTour(slug);
  const want = (Array.isArray(langs) ? langs : []).filter((l) => typeof l === "string" && l !== "da");
  const pages = (Array.isArray(links) ? links : []).filter((l) => typeof l === "string" && /^https:\/\//i.test(l));
  if (!want.length) return { ok: false, error: "Vælg et sprog først." };
  if (!pages.length) return { ok: false, error: "Touren har ingen links til hjemmesider." };
  return { ok: true, ...(await linkAlternates(pages, want)) };
}
