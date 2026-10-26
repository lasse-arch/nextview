"use server";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { matchPages, sitePages } from "@/lib/site-pages";
import { startPlaces } from "@/app/(app)/tour-lab/tours/places";
import type { TourConfig } from "@/app/(app)/tour-lab/tours/types";

/** Suggests which of the customer's pages each place in the tour goes on (the editor shows them to confirm). */
export async function suggestEmbedPages(slug: string, site: string): Promise<{ ok: true; pages: Record<string, { url: string; title: string }>; checked: number } | { ok: false; error: string }> {
  const user = await requireUser();
  if (user.role !== "ADMIN") return { ok: false, error: "Kun admin." };
  const tour = await prisma.tour.findUnique({ where: { slug }, select: { config: true } });
  if (!tour) return { ok: false, error: "Touren findes ikke." };
  try {
    const pages = await sitePages(site);
    if (!pages.length) return { ok: false, error: "Fandt ingen sider på hjemmesiden." };
    return { ok: true, pages: matchPages(startPlaces(tour.config as unknown as TourConfig), pages), checked: pages.length };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
