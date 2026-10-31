"use server";

import { randomBytes } from "node:crypto";
import { getCurrentCustomer, getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { approveTour } from "@/lib/tour-review";
import { revalidatePath } from "next/cache";
import { can } from "@/lib/customer-roles";

/*
 * "Rettelser" on the customer's page: their tour in review mode (/p/<token>),
 * where they write what should be changed right in the tour. Only for a
 * tour on one of the login's own deals (or an admin looking as the customer);
 * the review link is made if the tour doesn't have one yet.
 */
export async function portalReview(slug: string): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const tour = await prisma.tour.findUnique({ where: { slug }, select: { dealId: true, reviewToken: true, published: true, reviewSentAt: true } });
  const customer = await getCurrentCustomer();
  const allowed = customer ? can(customer, tour?.dealId, "review") : (await getCurrentUser())?.role === "ADMIN";
  // A tour sent to them for review is theirs to see before it's published.
  if (!tour || !allowed || !(tour.published || tour.reviewSentAt)) return { ok: false, error: "Touren findes ikke." };
  if (tour.reviewToken) return { ok: true, token: tour.reviewToken };
  const token = randomBytes(12).toString("base64url");
  await prisma.tour.update({ where: { slug }, data: { reviewToken: token } });
  return { ok: true, token };
}

/**
 * "Godkend touren" on the customer's page: only the customer themselves, for
 * a tour on one of their own deals - an admin looking as the customer can't
 * approve in their name (we approve in the editor instead).
 */
export async function portalApprove(slug: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const customer = await getCurrentCustomer();
  if (!customer) return { ok: false, error: "Kun kunden selv kan godkende her - godkend i tour-editoren i stedet." };
  const tour = await prisma.tour.findUnique({ where: { slug }, select: { dealId: true, published: true, reviewSentAt: true } });
  if (!tour?.dealId || !customer.deals.some((d) => d.dealId === tour.dealId) || !(tour.published || tour.reviewSentAt)) return { ok: false, error: "Touren findes ikke." };
  if (!can(customer, tour.dealId, "approve")) return { ok: false, error: "Din rolle kan ikke godkende touren - spørg en ejer hos jer." };
  await approveTour(slug, { name: customer.name ?? customer.email, customer: true });
  revalidatePath("/kunde");
  return { ok: true };
}
