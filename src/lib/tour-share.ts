/*
 * What a customer sees of their tour's numbers - chosen per tour in the
 * editor (Resultater → Kundens rapport), shown in the preview there and on
 * the customer's own report link (/r/<token>). Booking/contact numbers are
 * by default only shown when there are any: a report of zeros helps nobody.
 */

export type ShareWhen = "auto" | "on" | "off";

export type ReportShare = {
  days: 30 | 90;
  visits: boolean;
  engaged: boolean;
  duration: boolean;
  /** "auto" = only when someone went on to booking/contact in the period. */
  leads: ShareWhen;
  actions: ShareWhen;
  perDay: boolean;
  places: boolean;
  sources: boolean;
  /** The free units' funnel (live data) - only when the tour has it and someone used it. */
  live: boolean;
  /** Where they went around: the rooms visitors came to. */
  rooms: boolean;
  /** Where they stayed longest: typical time in each room. */
  roomTime: boolean;
  /** What they opened: points on the aerial photo, info points, place cards, 360° photos. */
  opened: boolean;
  /** Where they looked around longest: the places, with the room's picture (never the exact view or a link to it). */
  looks: boolean;
  /** The heatmap: where they stay inside (the floor plan) and what they open on the aerial photo. */
  heatmap: boolean;
  /** What else they used: Find vej (and where to), videos, pictures, people, Infobokse, links out … */
  used: boolean;
};

export const DEFAULT_SHARE: ReportShare = { days: 30, visits: true, engaged: true, duration: true, leads: "auto", actions: "auto", perDay: true, places: true, sources: false, live: true, rooms: true, roomTime: true, opened: true, looks: true, heatmap: true, used: true };

export const shareOf = (raw: unknown): ReportShare => ({ ...DEFAULT_SHARE, ...(raw && typeof raw === "object" ? (raw as Partial<ReportShare>) : {}) });

/** Is a "when" part shown, given how many leads there were? */
export const shown = (when: ShareWhen, leads: number) => when === "on" || (when === "auto" && leads > 0);
