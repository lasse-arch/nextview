import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { TOURS } from "@/app/(app)/tour-lab/tours";
import type { TourConfig } from "@/app/(app)/tour-lab/tours/types";

/*
 * Tours live in the database (Tour + TourVersion). The setups written while
 * prototyping (src/app/(app)/tour-lab/tours) are only starting points: the
 * first time the tour-lab is opened, any of them not yet in the database is
 * added - linked to its customer when exactly one deal matches its name.
 */

let seeded: Promise<void> | null = null;

async function seed() {
  const existing = new Set((await prisma.tour.findMany({ select: { slug: true } })).map((t) => t.slug));
  for (const config of Object.values(TOURS)) {
    if (existing.has(config.slug)) continue;
    const deals = await prisma.deal.findMany({
      where: { OR: [{ companyName: { contains: config.brand, mode: "insensitive" } }, { displayName: { contains: config.brand, mode: "insensitive" } }] },
      select: { id: true },
      take: 2,
    });
    await prisma.tour
      .create({
        data: {
          slug: config.slug,
          name: config.title,
          dealId: deals.length === 1 ? deals[0].id : null,
          config: config as unknown as Prisma.InputJsonValue,
          versions: { create: { config: config as unknown as Prisma.InputJsonValue, note: "Oprettet fra prototypen", createdByName: "Arpo" } },
        },
      })
      .catch(() => {}); // created by a parallel request meanwhile
  }
}

/** Adds the prototype setups not yet in the database (once per server process). */
export function ensureToursSeeded() {
  seeded ??= seed().catch((err) => {
    seeded = null;
    throw err;
  });
  return seeded;
}

export async function listTours() {
  await ensureToursSeeded();
  return prisma.tour.findMany({
    orderBy: [{ updatedAt: "desc" }],
    select: { id: true, slug: true, name: true, updatedAt: true, deal: { select: { id: true, companyName: true, displayName: true } } },
  });
}

/** A tour's setup by its address - from the database, or the prototype file if it isn't there (yet). */
export async function getTourConfig(slug: string): Promise<TourConfig | null> {
  await ensureToursSeeded().catch(() => {});
  const row = await prisma.tour.findUnique({ where: { slug }, select: { slug: true, config: true } }).catch(() => null);
  if (row) return { ...(row.config as unknown as TourConfig), slug: row.slug };
  return TOURS[slug] ?? null;
}
