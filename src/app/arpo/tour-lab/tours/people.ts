import type { CardPerson, TeamPerson, TourConfig } from "./types";

/*
 * The red thread for people: a person is made once, in "Personer"
 * (TourConfig.team), and picked everywhere a tour shows people - a place card,
 * a stop in "Vis mig rundt", a line's teachers, a subject in the schedule.
 * Such a pick is a CardPerson with the person's `id`; when the tour is shown,
 * it gets the person's photo, name and role as they are now - change Per's
 * photo once, it changes everywhere. (Its own copy stays as it was saved: a
 * person taken out of the list still shows.) A person without an id is one
 * written on that card only, as before.
 */

/** A picked person as the tour shows it: the list's current photo, name and role. */
export function resolvedPerson(team: Map<string, TeamPerson>, p: CardPerson): CardPerson {
  const t = p.id ? team.get(p.id) : undefined;
  return t ? { ...p, image: t.image || p.image, name: t.name, role: t.role } : p;
}

/** Every "people" list in the tour, filled in from the list - one walk when the tour is loaded (any list, now or later). */
export function withPeople(T: TourConfig): TourConfig {
  const list = T.team?.people;
  if (!list?.length) return T;
  const team = new Map(list.map((p) => [p.id, p]));
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (!v || typeof v !== "object") return v;
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [
        k,
        k === "people" && Array.isArray(x) ? x.map((p) => (p && typeof p === "object" && "image" in p ? resolvedPerson(team, p as CardPerson) : p)) : k === "team" ? x : walk(x),
      ])
    );
  };
  return walk(T) as TourConfig;
}

/** A person picked from the list - the copy kept with the pick, so it still shows if the person is taken out. */
export function pickOf(p: TeamPerson): CardPerson {
  return { id: p.id, image: p.image, ...(p.name ? { name: p.name } : {}), ...(p.role ? { role: p.role } : {}) };
}

/** A short id from a name ("Per Muldbjerg" → "per"), unique in the list. */
export function personId(name: string, taken: string[]): string {
  const base =
    name
      .trim()
      .split(/\s+/)[0]
      .toLowerCase()
      .replace(/æ/g, "ae")
      .replace(/ø/g, "oe")
      .replace(/å/g, "aa")
      .replace(/[^a-z0-9-]/g, "") || "person";
  let id = base;
  for (let i = 2; taken.includes(id); i++) id = `${base}-${i}`;
  return id;
}
