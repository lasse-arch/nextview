import "server-only";

/*
 * "Vejret": the weather where a tour is, for its drone scene - the weather
 * right now (DMI's HARMONIE forecast) and what a month is typically like
 * (DMI's climate data, the last ten whole years, for the 10 km square
 * nearest the place). DMI's open data is free and may be used commercially.
 * Only coordinates stored on a tour are asked for (never ones from a
 * visitor), and every answer is kept, so DMI is asked rarely: "now" for 30
 * minutes (the last good one is used for up to 6 hours when DMI is busy),
 * the months for a week.
 */

const DMI = "https://opendataapi.dmi.dk";

export type WeatherNow = {
  /** °C, whole degrees. */
  temp: number;
  /** m/s, whole. */
  wind: number;
  sky: "sol" | "klart" | "let-skyet" | "skyet" | "regn";
  /** "HH:MM" in Danish time; null in polar day/night. */
  sunrise: string | null;
  sunset: string | null;
};

/** What a month is typically like (averages of the last ten whole years). */
export type WeatherMonth = {
  /** Mean temperature, °C (one decimal). */
  temp: number;
  /** The warmest day's temperature, typically - °C. */
  warmest: number;
  /** Hours of sunshine in the month. */
  sun: number;
  /** Rain in the month, mm. */
  rain: number;
  /** Mean wind, m/s. */
  wind: number;
};

const kept = new Map<string, { at: number; value: unknown }>();
const NOW_FRESH = 30 * 60_000;
const NOW_STALE = 6 * 3_600_000;
const CLIMATE_FRESH = 7 * 86_400_000;

async function getJson(url: string, retry = true): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000), cache: "no-store" });
  // DMI says "busy" now and then: one more try a moment later.
  if (res.status === 429 && retry) {
    await new Promise((r) => setTimeout(r, 1500));
    return getJson(url, false);
  }
  if (!res.ok) throw new Error(`DMI ${res.status}`);
  return res.json();
}

/** A kept answer while fresh; else a new one - and the old one (while not too old) when DMI fails. */
async function keep<T>(key: string, fresh: number, stale: number, make: () => Promise<T>): Promise<T | null> {
  const old = kept.get(key);
  if (old && Date.now() - old.at < fresh) return old.value as T;
  try {
    const value = await make();
    kept.set(key, { at: Date.now(), value });
    return value;
  } catch (err) {
    console.warn("weather", key, err instanceof Error ? err.message : err);
    return old && Date.now() - old.at < stale ? (old.value as T) : null;
  }
}

const coord = (n: number) => n.toFixed(3);

/* ------------------------------------------------------------------ */

type ForecastFeature = { properties?: Record<string, number | string | undefined> };

export async function weatherNow(lat: number, lon: number): Promise<WeatherNow | null> {
  const now = await keep(`now:${coord(lat)},${coord(lon)}`, NOW_FRESH, NOW_STALE, () => forecastNow(lat, lon).catch(() => observedNow(lat, lon)));
  // No sun after dark: a clear night is "klart".
  if (now?.sky === "sol" && now.sunrise && now.sunset) {
    const hm = new Date().toLocaleTimeString("da-DK", { timeZone: "Europe/Copenhagen", hour: "2-digit", minute: "2-digit" });
    if (hm < now.sunrise || hm > now.sunset) return { ...now, sky: "klart" };
  }
  return now;
}

/** DMI's forecast for the hour (HARMONIE, 2.5 km). */
async function forecastNow(lat: number, lon: number): Promise<WeatherNow> {
  const q = new URLSearchParams({
    coords: `POINT(${coord(lon)} ${coord(lat)})`,
    "parameter-name": "temperature-2m,wind-10m-u,wind-10m-v,fraction-of-cloud-cover,total-precipitation",
    crs: "crs84",
    f: "GeoJSON",
  });
  const data = (await getJson(`${DMI}/v1/forecastedr/collections/harmonie_dini_sf/position?${q}`)) as { features?: ForecastFeature[] };
  const steps = (data.features ?? [])
    .map((f) => f.properties ?? {})
    .filter((p) => typeof p.step === "string" && typeof p["temperature-2m"] === "number")
    .sort((a, b) => String(a.step).localeCompare(String(b.step)));
  if (!steps.length) throw new Error("no forecast");
  const now = Date.now();
  const at = steps.reduce((best, p) => (Math.abs(Date.parse(String(p.step)) - now) < Math.abs(Date.parse(String(best.step)) - now) ? p : best));
  // Precipitation is accumulated from the forecast's start: this hour's is the step minus the one before.
  const i = steps.indexOf(at);
  const acc = (p: (typeof steps)[number] | undefined) => (typeof p?.["total-precipitation"] === "number" ? p["total-precipitation"] : 0);
  const nextHour = steps[i + 1] ? acc(steps[i + 1]) - acc(at) : 0;
  const lastHour = i > 0 ? acc(at) - acc(steps[i - 1]) : 0;
  const rain = Math.max(nextHour, lastHour);
  const cloud = typeof at["fraction-of-cloud-cover"] === "number" ? at["fraction-of-cloud-cover"] : 0.5;
  const u = Number(at["wind-10m-u"] ?? 0);
  const v = Number(at["wind-10m-v"] ?? 0);
  const sun = sunTimes(lat, lon, new Date());
  return {
    temp: Math.round(Number(at["temperature-2m"]) - 273.15),
    wind: Math.round(Math.hypot(u, v)),
    sky: rain > 0.2 ? "regn" : cloud < 0.25 ? "sol" : cloud < 0.7 ? "let-skyet" : "skyet",
    ...sun,
  } satisfies WeatherNow;
}

type ObsFeature = { geometry?: { coordinates?: [number, number] }; properties?: { stationId?: string; parameterId?: string; value?: number } };

/** When the forecast is busy: the last hour's measurements at the nearest DMI station (within ~50 km) that measures temperature. */
async function observedNow(lat: number, lon: number): Promise<WeatherNow> {
  const d = 0.45;
  const q = new URLSearchParams({ bbox: [lon - d * 1.8, lat - d, lon + d * 1.8, lat + d].map((n) => n.toFixed(3)).join(","), period: "latest-hour", limit: "2000" });
  const data = (await getJson(`${DMI}/v2/metObs/collections/observation/items?${q}`)) as { features?: ObsFeature[] };
  const stations = new Map<string, { dist: number; v: Record<string, number> }>();
  for (const f of data.features ?? []) {
    const p = f.properties;
    const c = f.geometry?.coordinates;
    if (!p?.stationId || !p.parameterId || typeof p.value !== "number" || !c) continue;
    const s = stations.get(p.stationId) ?? { dist: Math.hypot((c[0] - lon) * Math.cos((lat * Math.PI) / 180), c[1] - lat), v: {} };
    s.v[p.parameterId] ??= p.value;
    stations.set(p.stationId, s);
  }
  const near = [...stations.values()].filter((s) => typeof s.v.temp_dry === "number").sort((a, b) => a.dist - b.dist);
  const at = near[0];
  if (!at) throw new Error("no station near the place");
  // Rain from any station close by; clouds (in %, octas*12.5) where measured, else the nearest that has them.
  const rain = Math.max(0, ...near.filter((s) => s.dist < near[0].dist + 0.2).map((s) => s.v.precip_past1h ?? 0));
  const cloud = near.find((s) => typeof s.v.cloud_cover === "number")?.v.cloud_cover;
  return {
    temp: Math.round(at.v.temp_dry),
    wind: Math.round(at.v.wind_speed ?? near.find((s) => typeof s.v.wind_speed === "number")?.v.wind_speed ?? 0),
    sky: rain > 0.2 ? "regn" : cloud == null ? "let-skyet" : cloud < 25 ? "sol" : cloud < 70 ? "let-skyet" : "skyet",
    ...sunTimes(lat, lon, new Date()),
  };
}

/* ------------------------------------------------------------------ */

const CLIMATE_PARAMS = { temp: "mean_temp", warmest: "max_temp_w_date", sun: "bright_sunshine", rain: "acc_precip", wind: "mean_wind_speed" } as const;

type GridFeature = { geometry?: { coordinates?: number[][][] }; properties?: { cellId?: string; from?: string; value?: number } };

/** The twelve months (January first), typically - or null when DMI has nothing for the place (e.g. out at sea, abroad). */
export function weatherMonths(lat: number, lon: number): Promise<WeatherMonth[] | null> {
  return keep(`months:${coord(lat)},${coord(lon)}`, CLIMATE_FRESH, CLIMATE_FRESH * 4, async () => {
    const lastYear = new Date().getFullYear() - 1;
    // DMI's months run from midnight Danish time: from early December the year before.
    const datetime = `${lastYear - 10}-12-15T00:00:00Z/${lastYear}-12-31T23:00:00Z`;
    // The squares are 10 km; ~10 km around the place finds the nearest one on land (by last July's temperature).
    const d = 0.1;
    const bbox = [lon - d * 1.8, lat - d, lon + d * 1.8, lat + d].map((n) => n.toFixed(3)).join(",");
    const near = new URLSearchParams({ bbox, timeResolution: "month", parameterId: "mean_temp", datetime: `${lastYear}-06-15T00:00:00Z/${lastYear}-08-15T00:00:00Z`, limit: "100" });
    const squares = ((await getJson(`${DMI}/v2/climateData/collections/10kmGridValue/items?${near}`)) as { features?: GridFeature[] }).features ?? [];
    const middles = new Map<string, number>();
    for (const f of squares) {
      const id = f.properties?.cellId;
      const ring = f.geometry?.coordinates?.[0];
      if (!id || !ring?.length || middles.has(id)) continue;
      const mx = ring.reduce((s, c) => s + c[0], 0) / ring.length;
      const my = ring.reduce((s, c) => s + c[1], 0) / ring.length;
      middles.set(id, Math.hypot((mx - lon) * Math.cos((lat * Math.PI) / 180), my - lat));
    }
    const cell = [...middles.entries()].sort((a, b) => a[1] - b[1])[0]?.[0];
    if (!cell) throw new Error("no climate square near the place");
    // Then ten years of that one square.
    const all = await Promise.all(
      Object.entries(CLIMATE_PARAMS).map(async ([key, id]) => {
        const q = new URLSearchParams({ cellId: cell, timeResolution: "month", parameterId: id, datetime, limit: "300" });
        const data = (await getJson(`${DMI}/v2/climateData/collections/10kmGridValue/items?${q}`)) as { features?: GridFeature[] };
        return [key, data.features ?? []] as const;
      })
    );
    const month = (from: string) => {
      // "2024-07-01T00:00:00.001000+02:00" is July (the month it starts, in Danish time).
      const m = /^\d{4}-(\d{2})/.exec(from);
      return m ? Number(m[1]) - 1 : -1;
    };
    const sums = Array.from({ length: 12 }, () => ({}) as Record<string, number[]>);
    for (const [key, features] of all) {
      for (const f of features) {
        const p = f.properties;
        if (p?.cellId !== cell || typeof p.value !== "number" || !p.from) continue;
        const m = month(p.from);
        if (m >= 0) (sums[m][key] ??= []).push(p.value);
      }
    }
    const avg = (xs: number[] | undefined, decimals: number) => {
      if (!xs?.length) return NaN;
      const f = 10 ** decimals;
      return Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * f) / f;
    };
    const months = sums.map((s) => ({ temp: avg(s.temp, 1), warmest: avg(s.warmest, 0), sun: avg(s.sun, 0), rain: avg(s.rain, 0), wind: avg(s.wind, 0) }));
    if (months.some((m) => Number.isNaN(m.temp))) throw new Error("climate data incomplete");
    return months.map((m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Number.isNaN(v) ? 0 : v])) as WeatherMonth);
  });
}

/* ------------------------------------------------------------------ */

/** Sunrise and sunset (NOAA's simple formulas, about a minute off), in Danish time. */
export function sunTimes(lat: number, lon: number, day: Date): { sunrise: string | null; sunset: string | null } {
  const rad = Math.PI / 180;
  const start = Date.UTC(day.getUTCFullYear(), 0, 0);
  const n = Math.floor((Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()) - start) / 86_400_000);
  const g = ((2 * Math.PI) / 365) * (n - 1);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const cosH = (Math.cos(90.833 * rad) - Math.sin(lat * rad) * Math.sin(decl)) / (Math.cos(lat * rad) * Math.cos(decl));
  if (cosH > 1 || cosH < -1) return { sunrise: null, sunset: null };
  const ha = Math.acos(cosH) / rad;
  const at = (minutesUtc: number) =>
    new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()) + minutesUtc * 60_000).toLocaleTimeString("da-DK", {
      timeZone: "Europe/Copenhagen",
      hour: "2-digit",
      minute: "2-digit",
    });
  return { sunrise: at(720 - 4 * (lon + ha) - eqTime), sunset: at(720 - 4 * (lon - ha) - eqTime) };
}

/* ------------------------------------------------------------------ */

/**
 * A place name → coordinates (OpenStreetMap's Nominatim; for the editor,
 * one search at a time by a person - within its usage policy). Denmark only.
 */
export async function findPlace(query: string): Promise<{ lat: number; lon: number; name: string } | null> {
  const q = new URLSearchParams({ q: query.slice(0, 120), format: "json", limit: "1", countrycodes: "dk" });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${q}`, {
    headers: { "User-Agent": "Arpo/1.0 (+https://nextview360.dk)", "Accept-Language": "da" },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const [hit] = (await res.json()) as { lat: string; lon: string; display_name: string }[];
  return hit ? { lat: Number(hit.lat), lon: Number(hit.lon), name: hit.display_name.split(",")[0] } : null;
}
