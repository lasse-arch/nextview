"use server";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isYmd, tourStats, type TourStats } from "@/lib/tour-stats";

/** A tour's numbers for a chosen period (Resultater's date picker) - the team only, at most a little over a year at a time. */
export async function tourStatsForPeriod(slug: string, from: string, to: string): Promise<{ ok: true; stats: TourStats } | { ok: false; error: string }> {
  await requireUser();
  if (!isYmd(from) || !isYmd(to) || from > to) return { ok: false, error: "Vælg en periode." };
  if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > 400) return { ok: false, error: "Vælg højst et år ad gangen." };
  if (!(await prisma.tour.findUnique({ where: { slug }, select: { slug: true } }))) return { ok: false, error: "Touren findes ikke." };
  return { ok: true, stats: await tourStats(slug, { from, to }) };
}

/**
 * "Nulstil tallene": the tour's numbers start from now - e.g. when it went out
 * with our own looks in them. Nothing is deleted: the visits from before just
 * aren't counted (in Resultater, the customer page and the reports).
 */
export async function resetTourStats(slug: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireUser();
  const r = await prisma.tour.updateMany({ where: { slug }, data: { statsSince: new Date() } });
  if (!r.count) return { ok: false, error: "Touren findes ikke." };
  return { ok: true };
}
