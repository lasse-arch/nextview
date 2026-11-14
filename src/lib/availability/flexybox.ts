import "server-only";
import { readLimited, safeFetch } from "@/lib/safe-fetch";

/*
 * "Holdplan" from Flexybox (the booking system many gyms use - e.g. Fitness
 * United: profile.flexybox.com/fitnessunited/classes-new): the coming classes,
 * read from the same public data their own class page reads (no login),
 * cached 10 minutes per chain - one read for every visitor. Only what the tour
 * shows is taken: the class, its time, room and instructor, whether it's
 * cancelled, and how full it is - only where the gym shows that publicly
 * themselves. Bookings and participants' names are never read on. Nothing is
 * ever sent to Flexybox from here. Not an official API: if it changes, the
 * tour just shows no class schedule.
 */

export type FlexyClass = {
  id: string;
  name: string;
  /** Local time as Flexybox writes it, e.g. "2026-11-13T17:00:00+01:00". */
  start: string;
  end: string;
  instructor?: string;
  /** The room, without the centre's name ("Holdsal"). */
  room?: string;
  cancelled?: true;
  /** Only when the gym shows it publicly: free places, or full (0) - and whether there's a waiting list. */
  free?: number;
  waitingList?: true;
};
export type FlexyDepartment = { id: string; name: string };

const API = "https://flexybox-proxy.azurewebsites.net/api/Local";
const TEN_MINUTES = 10 * 60_000;
const DAYS = 7;
const cache = new Map<string, { at: number; value: unknown }>();

/** The chain's name in Flexybox from its profile link (https://profile.flexybox.com/<chain>/…). */
export function flexyboxChain(raw: string): string | null {
  try {
    const u = new URL(String(raw).trim());
    if (u.protocol !== "https:" || u.hostname !== "profile.flexybox.com") return null;
    return /^\/([a-z0-9_-]{2,60})(?:\/|$)/i.exec(u.pathname)?.[1].toLowerCase() ?? null;
  } catch {
    return null;
  }
}

async function getJson<T>(chain: string, path: string, key: string): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TEN_MINUTES) return hit.value as T;
  const res = await safeFetch(`${API}/${encodeURIComponent(chain)}/v1/${path}`, {
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; Nextview360-tour)" },
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Flexybox svarede ${res.status}.`);
  const value = JSON.parse((await readLimited(res, 8_000_000)).toString("utf8")) as T;
  if (cache.size > 200) cache.clear();
  cache.set(key, { at: Date.now(), value });
  return value;
}

const text = (v: unknown, max = 80) => (typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, max) : undefined);
const time = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)?$/.test(v) ? v : null);

/** The chain's centres (Flexybox "departments"). */
export async function flexyboxDepartments(source: string): Promise<FlexyDepartment[]> {
  const chain = flexyboxChain(source);
  if (!chain) throw new Error("Linket skal være kundens Flexybox-side: https://profile.flexybox.com/…");
  const d = await getJson<{ Departments?: { Id?: unknown; Name?: unknown }[] }>(chain, "departments", `dep:${chain}`);
  return (d.Departments ?? []).flatMap((x) => (typeof x.Id === "string" && /^[0-9a-f-]{36}$/i.test(x.Id) && text(x.Name) ? [{ id: x.Id, name: text(x.Name)! }] : []));
}

type RawClass = {
  Id?: unknown; ClassTypeName?: unknown; StartTimeOffset?: unknown; EndTimeOffset?: unknown; InstructorName?: unknown; LocationName?: unknown;
  IsCanceled?: unknown; HideParticipantCount?: unknown; MemberCount?: unknown; MemberMax?: unknown; WaitingListMax?: unknown; DepartmentId?: unknown;
};

/**
 * The coming week's classes of one centre (`department`; left out: all), in
 * time order, those already over left out - optionally only in one room
 * (`room`: part of its name, e.g. "Holdsal").
 */
export async function flexyboxClasses(source: string, department?: string, room?: string): Promise<FlexyClass[]> {
  const chain = flexyboxChain(source);
  if (!chain) throw new Error("Linket skal være kundens Flexybox-side: https://profile.flexybox.com/…");
  const from = new Date();
  from.setUTCHours(0, 0, 0, 0);
  const to = new Date(from.getTime() + (DAYS + 1) * 86_400_000);
  const iso = (d: Date) => encodeURIComponent(d.toISOString().replace(/\.\d{3}Z$/, ".0Z"));
  const q = `classes?StartTime=${iso(from)}&EndTime=${iso(to)}&ClassIds=null&PeriodIds=null&InstructorIds=null&LocationIds=null&Take=&Skip=`;
  const d = await getJson<{ Classes?: RawClass[] }>(chain, q, `cls:${chain}:${from.toISOString().slice(0, 10)}`);
  const now = Date.now();
  const wantRoom = room?.trim().toLowerCase();
  const out: FlexyClass[] = [];
  for (const c of d.Classes ?? []) {
    if (department && c.DepartmentId !== department) continue;
    const start = time(c.StartTimeOffset);
    const end = time(c.EndTimeOffset);
    const name = text(c.ClassTypeName);
    if (!start || !end || !name || typeof c.Id !== "string" || Date.parse(end) < now) continue;
    // "Fitness United Skanderborg, Holdsal" → "Holdsal".
    const location = text(c.LocationName, 120);
    // Without a room after the comma it's only the centre's name ("Fitness United Risskov") - nothing to show.
    const roomName = location?.includes(",") ? location.slice(location.lastIndexOf(",") + 1).trim() : undefined;
    if (wantRoom && !roomName?.toLowerCase().includes(wantRoom)) continue;
    const cls: FlexyClass = { id: c.Id.slice(0, 40), name, start, end, ...(text(c.InstructorName) ? { instructor: text(c.InstructorName) } : {}), ...(roomName ? { room: roomName } : {}) };
    if (c.IsCanceled === true) cls.cancelled = true;
    // How full: only where the gym itself shows it.
    else if (c.HideParticipantCount === false && typeof c.MemberCount === "number" && typeof c.MemberMax === "number" && c.MemberMax > 0) {
      cls.free = Math.max(0, c.MemberMax - c.MemberCount);
      if (cls.free === 0 && typeof c.WaitingListMax === "number" && c.WaitingListMax > 0) cls.waitingList = true;
    }
    out.push(cls);
    if (out.length >= 300) break;
  }
  return out.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}
