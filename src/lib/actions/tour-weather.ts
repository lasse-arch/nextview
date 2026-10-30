"use server";

import { requireUser } from "@/lib/auth";
import { findPlace, weatherMonths, weatherNow, type WeatherMonth, type WeatherNow } from "@/lib/weather";

/** The editor's place search for "Vejret" (the team only). */
export async function findWeatherPlace(query: string): Promise<{ lat: number; lon: number; name: string; address: string } | { error: string }> {
  await requireUser();
  const q = query.trim();
  if (q.length < 2) return { error: "Skriv en by eller et sted." };
  try {
    return (await findPlace(q)) ?? { error: `Fandt ikke "${q}" i Danmark.` };
  } catch {
    return { error: "Kunne ikke søge lige nu - prøv igen." };
  }
}

/** The weather for a place, as the tour will show it - to check it in the editor (the team only). */
export async function checkWeather(lat: number, lon: number): Promise<{ now: WeatherNow | null; months: WeatherMonth[] | null }> {
  await requireUser();
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return { now: null, months: null };
  const [now, months] = await Promise.all([weatherNow(lat, lon), weatherMonths(lat, lon)]);
  return { now, months };
}
