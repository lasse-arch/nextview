import { prisma } from "@/lib/db";
import { geocodeAddress } from "@/lib/geocode";
import { dealName } from "@/lib/labels";

export type CustomerMapPoint = { id: string; name: string; lat: number; lon: number };

/** Only geocode this many new addresses per page load, so a large backlog can't stall the dashboard. */
const MAX_GEOCODES_PER_LOAD = 8;

export async function getCustomerMapPoints(): Promise<CustomerMapPoint[]> {
  const signedDeals = await prisma.deal.findMany({
    where: { contractSignedAt: { not: null }, address: { not: null } },
    select: {
      id: true,
      companyName: true,
      displayName: true,
      address: true,
      latitude: true,
      longitude: true,
    },
  });

  const points: CustomerMapPoint[] = [];
  let geocodedThisLoad = 0;

  for (const deal of signedDeals) {
    if (deal.latitude != null && deal.longitude != null) {
      points.push({ id: deal.id, name: dealName(deal), lat: deal.latitude, lon: deal.longitude });
      continue;
    }

    if (geocodedThisLoad >= MAX_GEOCODES_PER_LOAD || !deal.address) continue;
    geocodedThisLoad++;

    const result = await geocodeAddress(deal.address);
    if (!result) continue;

    await prisma.deal.update({
      where: { id: deal.id },
      data: { latitude: result.lat, longitude: result.lon },
    });
    points.push({ id: deal.id, name: dealName(deal), lat: result.lat, lon: result.lon });
  }

  return points;
}
