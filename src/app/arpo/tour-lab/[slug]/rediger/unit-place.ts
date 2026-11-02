import type { SiteUnit } from "../../tours/types";
import type { PlanLabel } from "@/lib/actions/tour-ai";
import { fitPlan } from "./plan-fit";

/*
 * The booking's pitches and cabins put on our site plan by the numbers printed
 * on it (nextviewAI reads them - readPlanNumbers): each unit on its own number
 * ("Plads 145" on 145, "Hytte 14" on the 14 in a little house). The booking's
 * own positions then say how its map lies on ours, so a unit whose number
 * couldn't be read (or was read wrong) lands where the rest says it should.
 */

const num = (s: string) => /(\d+\s?[a-z]?)\b/i.exec(s)?.[1].replace(/\s/g, "").toLowerCase() ?? null;
const isHouse = (u: SiteUnit) => u.kind === "hytte" || /hytte|værelse|vaerelse|motel|hus|room|cabin/i.test(`${u.name} ${u.cat ?? ""}`);

export function placeByNumbers(units: SiteUnit[], labels: PlanLabel[]): { units: SiteUnit[]; byNumber: number; byFit: number; left: number } {
  const matched = new Map<string, PlanLabel>();
  for (const u of units) {
    const n = num(u.name);
    if (!n) continue;
    const same = labels.filter((l) => l.text === n);
    const want = same.filter((l) => (isHouse(u) ? l.kind === "hus" : l.kind === "plads"));
    const pick = want.length === 1 ? want[0] : same.length === 1 ? same[0] : null;
    if (pick) matched.set(u.id, pick);
  }
  // How the booking's map lies on ours, from the units found by number (the ones read wrong left out by the fit).
  const pairs = units
    .filter((u) => matched.has(u.id) && u.bx != null && u.by != null)
    .map((u) => ({ plan: [u.bx!, u.by!] as [number, number], photo: [matched.get(u.id)!.x, matched.get(u.id)!.y] as [number, number] }));
  const fit = pairs.length >= 4 ? fitPlan(pairs) : null;
  const at = (x: number, y: number): [number, number] | null => {
    if (!fit) return null;
    const h = fit.h;
    const d = h[6] * x + h[7] * y + 1;
    return [(h[0] * x + h[1] * y + h[2]) / d, (h[3] * x + h[4] * y + h[5]) / d];
  };
  const far = fit ? Math.max(2.5, fit.err * 3) : Infinity;
  let byNumber = 0;
  let byFit = 0;
  let left = 0;
  const round = (v: number) => Math.round(v * 10) / 10;
  const next = units.map((u) => {
    const l = matched.get(u.id);
    const guess = u.bx != null && u.by != null ? at(u.bx, u.by) : null;
    // Its own number - unless the rest says that one was misread (far from where it belongs).
    if (l && (!guess || Math.hypot(guess[0] - l.x, guess[1] - l.y) <= far)) {
      byNumber++;
      return { ...u, x: round(l.x), y: round(l.y) };
    }
    if (guess && guess[0] > -5 && guess[0] < 105 && guess[1] > -5 && guess[1] < 105) {
      byFit++;
      return { ...u, x: round(guess[0]), y: round(guess[1]) };
    }
    left++;
    return u;
  });
  return { units: next, byNumber, byFit, left };
}
