"use server";

import { requireTour } from "@/lib/auth";
import { tourEvents } from "@/lib/availability/page-dates";

/** The editor's "Tjek": the coming dates the tour will show from a sign-up form - only the tour's own team. */
export async function checkTourDates(slug: string, source: string, field?: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  await requireTour(slug);
  try {
    const events = await tourEvents(source, field || undefined);
    return { ok: true, text: events.length ? `Kommende datoer: ${events.map((e) => e.title).join(" · ")}` : "Der er ingen kommende datoer lige nu." };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Siden kunne ikke læses." };
  }
}
