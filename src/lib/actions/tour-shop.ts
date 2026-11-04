"use server";

import { requireTour } from "@/lib/auth";
import { readShopProduct, readShopWeeks } from "@/lib/availability/webshop";

/** The editor's "Tjek": what the tour will read from a webshop product (TourPoint.shop) - only the tour's own team. */
export async function checkShopProduct(slug: string, url: string, weeksPage?: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  await requireTour(slug);
  try {
    const p = await readShopProduct(url);
    const guests = p.guests.map((g) => `${g.label}${g.price != null ? ` (${g.price} kr.)` : ""}`).join(", ");
    const weeks = weeksPage ? await readShopWeeks(weeksPage).catch(() => null) : null;
    const weekText = weeksPage ? (weeks?.length ? ` Hele uger: ${[...new Set(weeks.map((w) => w.week))].map((n) => `uge ${n}`).join(", ")} (${[...new Set(weeks.map((w) => w.name))].join(", ")}).` : " Hele uger: ingen fundet på siden.") : "";
    return {
      ok: true,
      text: `${p.name}: ${p.dates.length} datoer kan bookes (${p.dates[0]} til ${p.dates[p.dates.length - 1]})${p.basePrice != null ? `, fra ${p.basePrice} kr. pr. nat` : ""}${guests ? `. Gæster: ${guests}` : ""}.${weekText}`,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Siden kunne ikke læses." };
  }
}
