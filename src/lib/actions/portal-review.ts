"use server";

import { randomBytes } from "node:crypto";
import { getCurrentCustomer, getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

/*
 * "Rettelser" on the customer's page: their tour in review mode (/p/<token>),
 * where they write what should be changed right in the tour. Only for a
 * tour on one of the login's own deals (or an admin looking as the customer);
 * the review link is made if the tour doesn't have one yet.
 */
export async function portalReview(slug: string): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const tour = await prisma.tour.findUnique({ where: { slug }, select: { dealId: true, reviewToken: true, published: true } });
  const customer = await getCurrentCustomer();
  const allowed = customer ? Boolean(tour?.dealId && customer.deals.some((d) => d.dealId === tour.dealId)) : (await getCurrentUser())?.role === "ADMIN";
  if (!tour || !allowed || !tour.published) return { ok: false, error: "Touren findes ikke." };
  if (tour.reviewToken) return { ok: true, token: tour.reviewToken };
  const token = randomBytes(12).toString("base64url");
  await prisma.tour.update({ where: { slug }, data: { reviewToken: token } });
  return { ok: true, token };
}
