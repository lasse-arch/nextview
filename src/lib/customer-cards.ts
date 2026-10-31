import "server-only";
import { prisma } from "@/lib/db";
import { dealName, needsDeliveryLink } from "@/lib/labels";
import { industryOf } from "@/lib/industries";
import { getAppBaseUrl } from "@/lib/email-oauth";
import { tourUrl } from "@/lib/public-urls";

/*
 * The customers as the pickers and lists in Arpo show them: name, address,
 * a picture (their tour's photo from Matterport) and what they have. No
 * amounts - these are used where everyone on the team looks.
 */

export type CustomerCard = {
  id: string;
  name: string;
  address: string | null;
  industry: string;
  /** "live", "coming" (signed, not live yet) or "stopped". */
  state: "live" | "coming" | "stopped";
  liveAt: string | null;
  thumb: string | null;
  products: { id: string; productType: string; url: string | null; imageUrl: string | null }[];
  hasLogin: boolean;
};

/** What the picker needs - small, for every customer on every page that has it (no Visitkort pictures). */
export type PickerCustomer = Pick<CustomerCard, "id" | "name" | "address" | "industry" | "state" | "thumb"> & { products: string[] };
export const forPicker = (cards: CustomerCard[]): PickerCustomer[] =>
  cards.map((c) => ({ id: c.id, name: c.name, address: c.address, industry: c.industry, state: c.state, thumb: c.thumb, products: [...new Set(c.products.map((p) => p.productType))] }));

export async function customerCards(): Promise<CustomerCard[]> {
  const deals = await prisma.deal.findMany({
    where: { OR: [{ stage: { in: ["LIVE", "FILMED", "CONTRACT_SIGNED"] } }, { churnedAt: { not: null } }] },
    select: {
      id: true,
      companyName: true,
      displayName: true,
      address: true,
      industry: true,
      stage: true,
      liveAt: true,
      churnedAt: true,
      items: { orderBy: { createdAt: "asc" }, select: { id: true, productType: true, url: true, imageUrl: true } },
      tours: { where: { OR: [{ published: true }, { liveVersion: { not: null } }] }, orderBy: { createdAt: "asc" }, select: { slug: true, liveVersion: true } },
      _count: { select: { customerAccounts: true } },
    },
  });
  return deals
    .map((d) => {
      const tourItem = d.items.find((i) => i.url && needsDeliveryLink(i.productType) && !/hjemmeside/i.test(i.productType));
      return {
        id: d.id,
        name: dealName(d),
        address: d.address,
        industry: industryOf(dealName(d), d.industry),
        state: d.churnedAt ? ("stopped" as const) : d.stage === "LIVE" ? ("live" as const) : ("coming" as const),
        liveAt: d.liveAt?.toISOString() ?? null,
        thumb: d.tours[0] ? `/api/tour-thumb?tour=${encodeURIComponent(d.tours[0].slug)}` : tourItem ? `/api/tour-thumb?item=${tourItem.id}` : null,
        // The deal's products - and its tours from Arpo that are out, when no product has their link yet (e.g. approved and set live by itself).
        products: [
          ...d.items,
          ...d.tours
            .map((t) => ({ id: `tour:${t.slug}`, productType: "Nextview360 Tour", url: tourUrl(t.slug, getAppBaseUrl(), t.liveVersion != null), imageUrl: null }))
            .filter((t) => !d.items.some((i) => i.url && (i.url === t.url || i.url.includes(t.id.slice(5))))),
        ],
        hasLogin: d._count.customerAccounts > 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "da"));
}
