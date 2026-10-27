import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dealName, needsDeliveryLink } from "@/lib/labels";
import { industryOf } from "@/lib/industries";
import { CLOUDFLARE_TOUR_ORIGIN } from "@/lib/public-urls";
import { OnlineTours, type OnlineTour } from "./online-tours";

export const metadata = { title: "Online kunder" };

/*
 * "Online kunder" (Salg): every tour that's out there, by industry - so a
 * seller about to meet a campsite finds a campsite tour to show in seconds,
 * and shows it in a big window right there. Our own tours from Arpo, and the
 * tour links on live customers that are still on explore. No money here.
 */
export default async function OnlineCustomersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/api/auth/session-ended?next=/arpo");

  const [deals, tours] = await Promise.all([
    prisma.deal.findMany({
      where: { stage: "LIVE", churnedAt: null },
      select: { id: true, companyName: true, displayName: true, industry: true, address: true, liveAt: true, items: { where: { url: { not: null } }, select: { id: true, productType: true, location: true, url: true } } },
    }),
    prisma.tour.findMany({
      where: { OR: [{ published: true }, { liveVersion: { not: null } }] },
      select: { slug: true, name: true, liveVersion: true, createdAt: true, deal: { select: { id: true, companyName: true, displayName: true, industry: true, address: true } } },
    }),
  ]);

  const city = (address: string | null | undefined) => address?.split(",").pop()?.replace(/\d{4}/, "").trim() || null;
  const list: OnlineTour[] = [];
  const withArpoTour = new Set<string>();
  // One customer's tours (e.g. a full tour and a room picker of the same place) are one card, with a choice between them.
  const variant = (tourName: string, customer: string) => {
    const rest = tourName.replace(customer, "").replace(/^[\s\-–·:]+/, "").trim();
    return rest ? rest[0].toUpperCase() + rest.slice(1) : "Fuld tour";
  };
  const shortest = [...tours].sort((a, b) => a.name.length - b.name.length);
  for (const t of shortest) {
    const url = t.liveVersion != null ? `${CLOUDFLARE_TOUR_ORIGIN}/${t.slug}` : `/t/${t.slug}`;
    const same = t.deal && list.find((x) => x.ours && x.dealId === t.deal!.id);
    if (same) {
      same.variants.push({ key: t.slug, label: variant(t.name, same.name), url });
      continue;
    }
    if (t.deal) withArpoTour.add(t.deal.id);
    const name = t.deal ? dealName(t.deal) : t.name;
    list.push({
      key: `t:${t.slug}`,
      variants: [{ key: t.slug, label: "Fuld tour", url }],
      name: t.name,
      customer: name,
      dealId: t.deal?.id ?? null,
      industry: industryOf(`${name} ${t.name}`, t.deal?.industry),
      industrySet: Boolean(t.deal?.industry),
      city: city(t.deal?.address),
      url,
      thumb: `/api/tour-thumb?tour=${encodeURIComponent(t.slug)}&w=480`,
      ours: true,
      since: t.createdAt.toISOString(),
    });
  }
  for (const d of deals) {
    // A customer with a tour in Arpo is shown by that one - not again by its old explore link.
    if (withArpoTour.has(d.id)) continue;
    const items = d.items.filter((i) => needsDeliveryLink(i.productType) && !/hjemmeside/i.test(i.productType));
    if (!items.length) continue;
    const link = (u: string) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);
    // All of one customer's tour links in one card - "Fuld tour", and the others by their location (e.g. "Rum").
    const label = (i: (typeof items)[number], n: number) => (i.location ? variant(i.location, dealName(d)) : n === 0 ? "Fuld tour" : `Tour ${n + 1}`);
    list.push({
      key: `i:${items[0].id}`,
      variants: items.length > 1 ? items.map((i, n) => ({ key: i.id, label: label(i, n), url: link(i.url!) })) : [],
      name: dealName(d),
      customer: dealName(d),
      dealId: d.id,
      industry: industryOf(dealName(d), d.industry),
      industrySet: Boolean(d.industry),
      city: city(d.address),
      url: link(items[0].url!),
      thumb: `/api/tour-thumb?item=${encodeURIComponent(items[0].id)}&w=480`,
      ours: false,
      since: (d.liveAt ?? new Date(0)).toISOString(),
    });
  }
  list.sort((a, b) => a.name.localeCompare(b.name, "da"));

  return <OnlineTours tours={list} isAdmin={user.role === "ADMIN"} />;
}
