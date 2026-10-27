import type { TourStats } from "@/lib/tour-stats";
import type { ReportShare, ShareWhen } from "@/lib/tour-share";

/*
 * Several tours' numbers as one - for a customer with more locations (or
 * more tours), whose own page shows them all together first. Counts are
 * added up; the typical visit and the mobile share are weighted by visits.
 */

const sumRows = (lists: { label: string; count: number }[][]) => {
  const m = new Map<string, number>();
  for (const l of lists) for (const r of l) m.set(r.label, (m.get(r.label) ?? 0) + r.count);
  return [...m].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
};

export function mergeStats(all: TourStats[]): TourStats | null {
  if (!all.length) return null;
  if (all.length === 1) return all[0];
  const visits = all.reduce((n, s) => n + s.visits, 0);
  const weighted = (f: (s: TourStats) => number) => (visits ? all.reduce((n, s) => n + f(s) * s.visits, 0) / visits : 0);
  const days = new Map<string, { visits: number; leads: number }>();
  for (const s of all)
    for (const d of s.perDay) {
      const x = days.get(d.day) ?? { visits: 0, leads: 0 };
      days.set(d.day, { visits: x.visits + d.visits, leads: x.leads + d.leads });
    }
  return {
    days: Math.max(...all.map((s) => s.days)),
    visits,
    engaged: all.reduce((n, s) => n + s.engaged, 0),
    leads: all.reduce((n, s) => n + s.leads, 0),
    medianSeconds: Math.round(weighted((s) => s.medianSeconds)),
    mobileShare: weighted((s) => s.mobileShare),
    perDay: [...days].sort(([a], [b]) => a.localeCompare(b)).map(([day, v]) => ({ day, ...v })),
    actions: sumRows(all.map((s) => s.actions)),
    places: sumRows(all.map((s) => s.places)).slice(0, 10),
    sources: sumRows(all.map((s) => s.sources)),
    live: {
      seen: all.reduce((n, s) => n + s.live.seen, 0),
      opened: all.reduce((n, s) => n + s.live.opened, 0),
      viewed: all.reduce((n, s) => n + s.live.viewed, 0),
      booked: all.reduce((n, s) => n + s.live.booked, 0),
      units: sumRows(all.map((s) => s.live.units)).slice(0, 10),
    },
    menu: { opened: all.reduce((n, s) => n + s.menu.opened, 0), groups: sumRows(all.map((s) => s.menu.groups)) },
  };
}

/** What may be shown of several tours together: only what every one of them shares. */
export function mergeShare(all: ReportShare[]): ReportShare | null {
  if (!all.length) return null;
  const when = (k: "leads" | "actions"): ShareWhen => (all.some((s) => s[k] === "off") ? "off" : all.every((s) => s[k] === "on") ? "on" : "auto");
  const every = (k: "visits" | "engaged" | "duration" | "perDay" | "places" | "sources" | "live") => all.every((s) => s[k]);
  return {
    days: all.every((s) => s.days === 90) ? 90 : 30,
    visits: every("visits"),
    engaged: every("engaged"),
    duration: every("duration"),
    leads: when("leads"),
    actions: when("actions"),
    perDay: every("perDay"),
    places: every("places"),
    sources: every("sources"),
    live: every("live"),
  };
}
