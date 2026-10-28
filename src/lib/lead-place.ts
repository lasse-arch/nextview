import { KOMMUNER, POSTCODES, REGIONS } from "./dk-postcodes";
import { OFFICE } from "./office";

/*
 * Where a lead is, from the postcode in its address: how far from our office
 * (as the crow flies, from the middle of the postcode), and its region and
 * kommune - for sorting and picking an area on the ringeliste.
 */

export type LeadPlace = { km: number; region: string; kommune: string; postcode: string };

/** The lead's place - null when its address has no Danish postcode we know. */
export function placeOf(address: string | null | undefined): LeadPlace | null {
  if (!address) return null;
  // "Præstbrovej 23, 9330 Dronninglund": the last four digits followed by a town.
  const codes = [...address.matchAll(/(?:^|[^\d])(\d{4})\s+\p{L}/gu)].map((m) => m[1]).reverse();
  const code = codes.find((c) => POSTCODES[c]);
  if (!code) return null;
  const [lat, lon, region, kommune] = POSTCODES[code];
  return { km: Math.round(distanceKm(OFFICE.lat, OFFICE.lon, lat, lon)), region: REGIONS[region], kommune: KOMMUNER[kommune], postcode: code };
}

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}
