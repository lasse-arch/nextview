"use server";

import { requireTour } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { tourLooks, type LookSpot } from "@/lib/tour-looks";
import { runTourInsights, type Insight, type InsightResult } from "@/lib/tour-insights-core";
import type { TourConfig } from "@/app/arpo/tour-lab/tours/types";

/*
 * Resultater's "Forslag ud fra tallene" and "Hvor folk kigger" (the work is in
 * lib/tour-insights-core.ts and lib/tour-looks.ts). Tips are kept, so the
 * latest (also the monthly ones made by themselves) show when Resultater opens.
 */

export type { Insight, InsightResult };

export async function suggestFromStats(slug: string, config: TourConfig): Promise<InsightResult> {
  const user = await requireTour(slug).catch(() => null);
  if (!user) return { ok: false, error: "Du har ikke adgang til tours." };
  const r = await runTourInsights(slug, config, user.name);
  if (r.ok) await prisma.tourTipRun.create({ data: { tourSlug: slug, summary: r.summary, suggestions: r.suggestions, visits: r.visits, source: "hånd" } }).catch(() => {});
  return r;
}

/** The latest tips kept for the tour (by hand or the monthly run) - null when there are none. */
export async function latestTourTips(slug: string): Promise<{ summary: string; suggestions: Insight[]; visits: number; at: string; auto: boolean } | null> {
  await requireTour(slug);
  const run = await prisma.tourTipRun.findFirst({ where: { tourSlug: slug }, orderBy: { createdAt: "desc" } });
  return run ? { summary: run.summary, suggestions: run.suggestions as Insight[], visits: run.visits, at: run.createdAt.toISOString(), auto: run.source === "auto" } : null;
}

/** "Hvor folk kigger" in Resultater. */
export async function tourLooksFor(slug: string): Promise<LookSpot[]> {
  await requireTour(slug);
  return (await tourLooks(slug)).slice(0, 15);
}
