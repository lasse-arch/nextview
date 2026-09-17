/**
 * Geocodes a Danish address via DAWA (Danmarks Adressers Web API) - a free,
 * public, key-less API from the Danish government. Returns null rather than
 * throwing when an address can't be matched, since addresses are free-text
 * and not every one will resolve.
 */
export async function geocodeAddress(address: string): Promise<{ lat: number; lon: number } | null> {
  const trimmed = address.trim();
  if (!trimmed) return null;

  try {
    const url = `https://api.dataforsyningen.dk/adresser?q=${encodeURIComponent(trimmed)}&per_side=1`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = (await res.json()) as {
      adgangsadresse?: { adgangspunkt?: { koordinater?: [number, number] } };
    }[];

    const coords = data[0]?.adgangsadresse?.adgangspunkt?.koordinater;
    if (!coords) return null;

    const [lon, lat] = coords;
    return { lat, lon };
  } catch {
    return null;
  }
}
