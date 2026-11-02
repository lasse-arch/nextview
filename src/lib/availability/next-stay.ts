import "server-only";
import { readLimited, safeFetch } from "@/lib/safe-fetch";

/*
 * Next-Stay (a campsite booking system): which pitches and cabins are free
 * for some dates, and the units with where they sit on its own site plan.
 * Only its public online-booking API, the same a guest's browser uses on the
 * campsite's booking page - read-only, never a booking. One fixed host, the
 * tenant id checked as a UUID, answers size-limited and cached a few minutes
 * so many visitors asking for the same dates ask Next-Stay once.
 */

const API = "https://api.next-stay-booking.dk/allocationapi";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const isTenantId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

async function getJson(url: string): Promise<unknown> {
  const res = await safeFetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000), maxRedirects: 0 });
  if (!res.ok) throw new Error(`Next-Stay svarede ${res.status}.`);
  return JSON.parse((await readLimited(res, 2_000_000)).toString("utf8"));
}

/** A stay that can be asked about: arrival before departure, at most 60 nights, from yesterday up to two years ahead. */
export function stayProblem(from: string, to: string, now = new Date()): string | null {
  if (!DAY.test(from) || !DAY.test(to)) return "Vælg datoer.";
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return "Afrejse skal være efter ankomst.";
  if ((b - a) / 86_400_000 > 60) return "Højst 60 nætter.";
  const today = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  if (a < today - 86_400_000 || b > today + 2 * 366 * 86_400_000) return "Vælg datoer inden for de næste to år.";
  return null;
}

const cache = new Map<string, { at: number; ids: string[] }>();

/** The ids of the units free for the whole stay. */
export async function nextStayFree(tenantId: string, from: string, to: string): Promise<string[]> {
  if (!isTenantId(tenantId)) throw new Error("Ukendt booking.");
  const problem = stayProblem(from, to);
  if (problem) throw new Error(problem);
  const key = `${tenantId}|${from}|${to}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 3 * 60_000) return hit.ids;
  const q = new URLSearchParams({ tenantId, start: `${from}T00:00:00`, end: `${to}T00:00:00` });
  const data = await getJson(`${API}/availability/rentalunits/online/tenant?${q}`);
  const ids = Array.isArray(data)
    ? data
        .filter((r): r is { resourceId: string; number: number } => Boolean(r) && typeof r === "object" && isTenantId((r as { resourceId?: unknown }).resourceId) && Number((r as { number?: unknown }).number) > 0)
        .map((r) => r.resourceId)
    : [];
  if (cache.size > 500) cache.clear();
  cache.set(key, { at: Date.now(), ids });
  return ids;
}

export type NextStayUnit = { id: string; name: string; x: number; y: number; category: string };

/** The units bookable online, each with its place on Next-Stay's own site plan (pixels) and its category's name. */
export async function nextStayUnits(tenantId: string): Promise<NextStayUnit[]> {
  if (!isTenantId(tenantId)) throw new Error("Det ligner ikke et Next-Stay-id.");
  const q = new URLSearchParams({ tenantId });
  const [units, cats] = await Promise.all([getJson(`${API}/rentalunit/list/all/tenant?${q}`), getJson(`${API}/rentalcategory/list/all/tenant?${q}&includeDeleted=false`)]);
  type Raw = { id?: unknown; isDeleted?: unknown; isAvailableOnline?: unknown; rentalCategoryId?: unknown; nameTranslations?: { s_da?: unknown }; mapSymbol?: { x?: unknown; y?: unknown; isHidden?: unknown } | null };
  const catName = new Map<string, string>();
  if (Array.isArray(cats)) for (const c of cats as Raw[]) if (isTenantId(c.id)) catName.set(c.id, String(c.nameTranslations?.s_da ?? "").slice(0, 80));
  if (!Array.isArray(units)) return [];
  return (units as Raw[])
    .filter((u) => isTenantId(u.id) && u.isDeleted !== true && u.isAvailableOnline === true && u.mapSymbol && u.mapSymbol.isHidden !== true && Number.isFinite(Number(u.mapSymbol.x)) && Number.isFinite(Number(u.mapSymbol.y)))
    .slice(0, 1000)
    .map((u) => ({
      id: u.id as string,
      name: String(u.nameTranslations?.s_da ?? "").slice(0, 60),
      x: Number(u.mapSymbol!.x),
      y: Number(u.mapSymbol!.y),
      category: catName.get(String(u.rentalCategoryId)) ?? "",
    }));
}
