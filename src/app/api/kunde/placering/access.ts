import "server-only";
import { getCurrentCustomer, getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { TourConfig } from "@/app/arpo/tour-lab/tours/types";

/*
 * Who may ask where a tour should sit on a website: the customer, for a tour
 * on one of their own deals that is out or sent to them - or someone from
 * the team. Asked from our own pages only (a POST from another site is
 * refused). `who` names them in the AI usage and the limits.
 */
export async function placementAccess(request: Request, slug: unknown): Promise<{ T: TourConfig; slug: string; who: string } | { error: string; status: number }> {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return { error: "Ikke tilladt.", status: 403 };
  if (typeof slug !== "string" || !/^[a-z0-9-]{1,80}$/.test(slug)) return { error: "Touren findes ikke.", status: 404 };
  const tour = await prisma.tour.findUnique({ where: { slug }, select: { config: true, dealId: true, published: true, reviewSentAt: true } });
  if (!tour) return { error: "Touren findes ikke.", status: 404 };
  const user = await getCurrentUser();
  if (user) return { T: tour.config as unknown as TourConfig, slug, who: `team:${user.id}` };
  const customer = await getCurrentCustomer();
  if (!customer || !tour.dealId || !customer.deals.some((d) => d.dealId === tour.dealId) || !(tour.published || tour.reviewSentAt)) return { error: "Touren findes ikke.", status: 404 };
  return { T: tour.config as unknown as TourConfig, slug, who: `kunde:${customer.id}` };
}

/** The address as one key: no "www.", no trailing slash, no query. */
export const siteKey = (u: URL) => `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}`;
