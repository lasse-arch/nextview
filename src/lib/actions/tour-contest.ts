"use server";

import { revalidatePath } from "next/cache";
import { randomInt } from "node:crypto";
import { prisma } from "@/lib/db";
import { getCurrentCustomer, teamSeesTour } from "@/lib/auth";
import { can } from "@/lib/customer-roles";
import { contestChests, deleteOldContestEntries } from "@/lib/tour-contest";
import type { TourConfig } from "@/app/arpo/tour-lab/tours/types";

/*
 * "Lodtrækning" on the customer page: the entries of a tour's treasure chest.
 * Only for those who may see them - a customer login with "entries" on the
 * tour's deal (owner, staff), or the team on a tour they may see (Se som
 * kunde). Drawing the winner, and deleting the list.
 */

async function mayHandle(slug: string): Promise<boolean> {
  const tour = await prisma.tour.findUnique({ where: { slug: String(slug) }, select: { dealId: true } });
  if (!tour) return false;
  const customer = await getCurrentCustomer();
  if (customer) return can(customer, tour.dealId, "entries");
  return Boolean(await teamSeesTour(slug));
}

export type ContestEntryRow = { id: string; name: string; email: string; phone: string; grade: string | null; infoOk: boolean; test: boolean; winner: boolean; at: string };

/** A chest's entries (newest first). */
export async function contestEntries(slug: string, itemId: string): Promise<ContestEntryRow[] | null> {
  if (!(await mayHandle(slug))) return null;
  await deleteOldContestEntries().catch(() => 0);
  const rows = await prisma.tourContestEntry.findMany({ where: { tourSlug: slug, itemId: String(itemId) }, orderBy: { createdAt: "desc" }, take: 5000 });
  return rows.map((r) => ({ id: r.id, name: r.name, email: r.email, phone: r.phone, grade: r.grade, infoOk: r.infoOk, test: r.test, winner: Boolean(r.winnerAt), at: r.createdAt.toISOString() }));
}

/** "Træk en vinder": one at random of those not drawn before (tests left out). */
export async function drawContestWinner(slug: string, itemId: string): Promise<{ ok: true; winner: ContestEntryRow } | { ok: false; error: string }> {
  if (!(await mayHandle(slug))) return { ok: false, error: "Du har ikke adgang til listen." };
  const tour = await prisma.tour.findUnique({ where: { slug }, select: { config: true } });
  if (!contestChests(tour?.config as unknown as TourConfig).some((c) => c.id === itemId)) return { ok: false, error: "Lodtrækningen findes ikke." };
  const pool = await prisma.tourContestEntry.findMany({ where: { tourSlug: slug, itemId, test: false, winnerAt: null }, select: { id: true } });
  if (!pool.length) return { ok: false, error: "Der er ingen at trække blandt." };
  const pick = pool[randomInt(pool.length)];
  const r = await prisma.tourContestEntry.update({ where: { id: pick.id }, data: { winnerAt: new Date() } });
  revalidatePath("/kunde");
  return { ok: true, winner: { id: r.id, name: r.name, email: r.email, phone: r.phone, grade: r.grade, infoOk: r.infoOk, test: r.test, winner: true, at: r.createdAt.toISOString() } };
}

/** "Slet listen" (also done by itself, keepDays after the draw). */
export async function deleteContestList(slug: string, itemId: string): Promise<{ ok: boolean }> {
  if (!(await mayHandle(slug))) return { ok: false };
  await prisma.tourContestEntry.deleteMany({ where: { tourSlug: slug, itemId: String(itemId) } });
  revalidatePath("/kunde");
  return { ok: true };
}
