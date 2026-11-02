import type { SiteUnit, TourConfig } from "./types";
import { safeColor } from "./safe";

/*
 * The booking's units by their kind: campsite pitches, cabins, rooms, the
 * motel … each its own colour on the site plan and its own chip in the filter
 * - its name and colour as the editor sets them (sitePlan.unitCats), else the
 * booking's category name and a colour of its own. A kind can have a place in
 * the tour (inside one of the cabins) that "Gå rundt" goes to.
 */

/** Distinct, clear on the drone photo and from each other - in the order the kinds come. */
export const UNIT_COLORS = ["#34c759", "#ff9f0a", "#0a84ff", "#bf5af2", "#ff375f", "#30b0c7", "#a2845e", "#5856d6"];

export const unitCatKey = (u: SiteUnit) => u.cat || (u.kind === "hytte" ? "Hytter og værelser" : "Pladser");

export type UnitGroup = { key: string; label: string; color: string; tour?: string };

export function unitGroups(plan: TourConfig["sitePlan"]): UnitGroup[] {
  const keys = [...new Set((plan?.units ?? []).map(unitCatKey))];
  return keys.map((key, i) => {
    const set = plan?.unitCats?.[key];
    return { key, label: set?.label || key, color: safeColor(set?.color, UNIT_COLORS[i % UNIT_COLORS.length]), tour: set?.tour };
  });
}

/** Where "Gå rundt" goes for this unit: its own place in the tour, else its kind's. */
export const unitTour = (plan: TourConfig["sitePlan"], u: SiteUnit) => u.tour || plan?.unitCats?.[unitCatKey(u)]?.tour;
