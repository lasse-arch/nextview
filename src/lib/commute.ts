import "server-only";

/*
 * "Vej til skolen": addresses as the visitor types them (Photon, OpenStreetMap
 * data - Denmark only) and the time by car, bike and on foot (OpenStreetMap's
 * route servers at routing.openstreetmap.de). Both are free services under
 * fair use: Arpo asks on the visitor's behalf, one ask at a time, cached, and
 * the tour's own endpoint limits how often each visitor may ask.
 */

const UA = { "User-Agent": "Arpo/1.0 (+https://nextview360.dk)" };
/** Denmark (with Bornholm) - so a search never lands abroad. */
const DK = "7.9,54.5,15.3,57.9";

export type Suggestion = { text: string; lat: number; lon: number };

export async function suggestAddresses(q: string): Promise<Suggestion[]> {
  const query = q.trim().slice(0, 100);
  if (query.length < 2) return [];
  const url = `https://photon.komoot.io/api/?${new URLSearchParams({ q: query, limit: "6", bbox: DK, lang: "default" })}`;
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(8_000), next: { revalidate: 86_400 } }).catch(() => null);
  if (!res?.ok) return [];
  const body = (await res.json().catch(() => null)) as { features?: { geometry?: { coordinates?: [number, number] }; properties?: Record<string, string> }[] } | null;
  const seen = new Set<string>();
  const out: Suggestion[] = [];
  for (const f of body?.features ?? []) {
    const [lon, lat] = f.geometry?.coordinates ?? [];
    const p = f.properties ?? {};
    if (p.countrycode !== "DK" || typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const street = [p.street ?? (p.osm_key === "place" ? "" : p.name), p.housenumber].filter(Boolean).join(" ");
    const town = [p.postcode, p.city ?? (p.osm_key === "place" ? p.name : "")].filter(Boolean).join(" ");
    const text = [street, town].filter(Boolean).join(", ") || p.name;
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push({ text: text.slice(0, 120), lat, lon });
  }
  return out;
}

export type Journey = { km: number; car: number | null; bike: number | null; walk: number | null };

async function minutes(profile: "car" | "bike" | "foot", from: [number, number], to: [number, number]): Promise<{ min: number; km: number } | null> {
  const url = `https://routing.openstreetmap.de/routed-${profile}/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=false`;
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(8_000), next: { revalidate: 86_400 } }).catch(() => null);
  if (!res?.ok) return null;
  const r = ((await res.json().catch(() => null)) as { routes?: { duration: number; distance: number }[] } | null)?.routes?.[0];
  return r ? { min: Math.max(1, Math.round(r.duration / 60)), km: Math.round(r.distance / 100) / 10 } : null;
}

/** From the visitor (rounded to ~100 m, so no exact address is ever sent on) to the place. */
export async function journey(from: [number, number], to: [number, number]): Promise<Journey | null> {
  const f: [number, number] = [Math.round(from[0] * 1000) / 1000, Math.round(from[1] * 1000) / 1000];
  const [car, bike, walk] = await Promise.all([minutes("car", f, to), minutes("bike", f, to), minutes("foot", f, to)]);
  if (!car && !bike && !walk) return null;
  return { km: car?.km ?? bike?.km ?? walk!.km, car: car?.min ?? null, bike: bike?.min ?? null, walk: walk && walk.min <= 180 ? walk.min : null };
}
