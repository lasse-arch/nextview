"use server";

import { requireTour } from "@/lib/auth";
import { nextStayUnits, type NextStayUnit } from "@/lib/availability/next-stay";

/** "Hent pladser fra Next-Stay" in the editor: the campsite's units with their place on Next-Stay's own site plan (pixels). */
export async function fetchNextStayUnits(slug: string, tenantId: string): Promise<{ ok: true; units: NextStayUnit[] } | { ok: false; error: string }> {
  await requireTour(slug);
  try {
    const units = await nextStayUnits(String(tenantId).trim());
    if (!units.length) return { ok: false, error: "Next-Stay sendte ingen pladser med placering." };
    return { ok: true, units };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
