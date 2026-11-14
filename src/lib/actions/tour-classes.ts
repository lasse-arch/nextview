"use server";

import { requireTour } from "@/lib/auth";
import { flexyboxClasses, flexyboxDepartments, type FlexyDepartment } from "@/lib/availability/flexybox";

/** The editor: the chain's centres to pick from, from its Flexybox link - only the tour's own team. */
export async function flexyboxCentres(slug: string, source: string): Promise<{ ok: true; departments: FlexyDepartment[] } | { ok: false; error: string }> {
  await requireTour(slug);
  try {
    const departments = await flexyboxDepartments(source);
    return departments.length ? { ok: true, departments } : { ok: false, error: "Flexybox har ingen centre under det link." };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Flexybox kunne ikke læses." };
  }
}

/** The editor's "Tjek": what the tour will show - the number of classes this week and the next few. */
export async function checkTourClasses(slug: string, source: string, department?: string, room?: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  await requireTour(slug);
  try {
    const all = await flexyboxClasses(source, department || undefined, room || undefined);
    if (!all.length) return { ok: true, text: "Ingen hold den kommende uge - tjek centeret og salen." };
    const next = all.slice(0, 3).map((c) => `${c.start.slice(8, 10)}/${c.start.slice(5, 7)} kl. ${c.start.slice(11, 16)} ${c.name}${c.cancelled ? " (aflyst)" : ""}`);
    return { ok: true, text: `${all.length} hold den kommende uge. De næste: ${next.join(", ")}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Flexybox kunne ikke læses." };
  }
}
