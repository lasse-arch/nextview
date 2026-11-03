/*
 * One showcase link's visits (/vis/<token>), read from its events: when, how
 * long, from where, what they saw, how far through the walk-through and
 * whether they pressed to get in touch. Shared by the tour editor's
 * "Fremvisning" list and the mail generator's "Sendt" list.
 */

export type DemoVisit = {
  session: string;
  start: string;
  /** Seconds between the first and the last thing that happened. */
  seconds: number;
  device: string | null;
  where: string | null;
  from: string | null;
  /** Rooms and places seen, in order (each once). */
  seen: string[];
  /** The walk-through: how far they got, and what they tried. */
  features: { seen: number; of: number } | null;
  tried: string[];
  /** The tour's own features they used ("Vis mig rundt", Find vej …), each once. */
  did: string[];
  /** Contact buttons pressed (the walk-through's or the tour's). */
  contact: boolean;
};

type Ev = {
  session: string;
  name: string;
  label: string | null;
  device: string | null;
  city: string | null;
  country: string | null;
  referrer: string | null;
  createdAt: Date;
};

const COUNTRY: Record<string, string> = {
  DK: "Danmark",
  DE: "Tyskland",
  SE: "Sverige",
  NO: "Norge",
  GB: "Storbritannien",
  NL: "Holland",
  US: "USA",
};
/** The events that say a feature was used - and what it's called to a seller. */
const DID: Record<string, string> = {
  guide_start: "Vis mig rundt",
  day_open: "Sådan ser en dag ud",
  route_start: "Find vej",
  story_start: "historierne",
  stories_start: "historierne",
  drone_view: "luftfotoet",
  finder_open: "søgningen",
  plan_open: "plantegningen",
  contact_form: "kontaktformularen",
  language: "skiftede sprog",
};
const ROOM_EVENTS = new Set([
  "room_view",
  "place_click",
  "menu_click",
  "place_card_view",
  "pano_open",
]);

/** The visits in one link's events (oldest first in), newest first out. */
export function demoVisits(events: Ev[]): DemoVisit[] {
  const sessions = new Map<string, Ev[]>();
  for (const e of [...events].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  ))
    sessions.set(e.session, [...(sessions.get(e.session) ?? []), e]);
  const visits: DemoVisit[] = [...sessions.entries()].map(([session, ev]) => {
    const first = ev[0];
    const last = ev[ev.length - 1];
    const close = [...ev].reverse().find((e) => e.name === "features_close");
    const seen = [
      ...new Set(
        ev
          .filter((e) => ROOM_EVENTS.has(e.name) && e.label)
          .map((e) => e.label!),
      ),
    ];
    const place = [
      first.city,
      first.country ? (COUNTRY[first.country] ?? first.country) : null,
    ]
      .filter(Boolean)
      .join(", ");
    return {
      session,
      start: first.createdAt.toISOString(),
      seconds: Math.round(
        (last.createdAt.getTime() - first.createdAt.getTime()) / 1000,
      ),
      device: first.device,
      where: place || null,
      from: ev.find((e) => e.referrer)?.referrer ?? null,
      seen,
      features: close?.label
        ? (([a, b]) => (a && b ? { seen: a, of: b } : null))(
            close.label.split("/").map(Number),
          )
        : null,
      tried: [
        ...new Set(
          ev
            .filter(
              (e) =>
                (e.name === "features_try" || e.name === "features_step") &&
                e.label,
            )
            .map((e) => e.label!),
        ),
      ],
      did: [...new Set(ev.filter((e) => DID[e.name]).map((e) => DID[e.name]))],
      contact: ev.some(
        (e) =>
          e.name === "contact_click" ||
          e.name === "demo_contact" ||
          e.name === "cta_click",
      ),
    };
  });
  return visits.sort((a, b) => b.start.localeCompare(a.start));
}
