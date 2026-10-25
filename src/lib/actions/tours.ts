"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { TourConfig } from "@/app/(app)/tour-lab/tours/types";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function admin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan redigere tours.");
  return user;
}

/** The minimum a setup must have for the tour to open - the rest has defaults or is optional. */
function check(config: unknown): string | null {
  if (!config || typeof config !== "object" || Array.isArray(config)) return "Opsætningen skal være et objekt.";
  const c = config as Partial<TourConfig>;
  for (const key of ["brand", "title", "tourPage", "start", "logo", "font"] as const) {
    if (typeof c[key] !== "string" || !c[key]) return `Mangler "${key}".`;
  }
  if (!c.colors || typeof c.colors !== "object") return 'Mangler "colors".';
  if (!Array.isArray(c.menu)) return '"menu" skal være en liste.';
  if (!Array.isArray(c.cta)) return '"cta" skal være en liste.';
  if (!String(c.tourPage).startsWith("https://explore.nextview360.dk/")) return "Tour-linket skal være et explore.nextview360.dk-link.";
  return null;
}

/** Saves a tour's setup as a new version. */
export async function saveTour(slug: string, config: TourConfig, note: string): Promise<Result<{ versionId: string }>> {
  const user = await admin();
  const error = check(config);
  if (error) return { ok: false, error };
  const tour = await prisma.tour.findUnique({ where: { slug }, select: { id: true } });
  if (!tour) return { ok: false, error: "Touren findes ikke." };
  const json = { ...config, slug } as unknown as Prisma.InputJsonValue;
  const version = await prisma.$transaction(async (tx) => {
    await tx.tour.update({ where: { id: tour.id }, data: { config: json, name: config.title } });
    return tx.tourVersion.create({ data: { tourId: tour.id, config: json, note: note.trim() || null, createdByName: user.name }, select: { id: true } });
  });
  revalidatePath("/tour-lab");
  revalidatePath(`/tour-lab/${slug}`);
  return { ok: true, versionId: version.id };
}

/** Puts an earlier version back (as a new version, so nothing is lost). */
export async function restoreTourVersion(versionId: string): Promise<Result> {
  const user = await admin();
  const v = await prisma.tourVersion.findUnique({ where: { id: versionId }, select: { config: true, createdAt: true, tour: { select: { id: true, slug: true } } } });
  if (!v) return { ok: false, error: "Versionen findes ikke." };
  const config = v.config as unknown as TourConfig;
  const stamp = v.createdAt.toLocaleString("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Copenhagen" });
  await prisma.$transaction([
    prisma.tour.update({ where: { id: v.tour.id }, data: { config: v.config as Prisma.InputJsonValue, name: config.title } }),
    prisma.tourVersion.create({ data: { tourId: v.tour.id, config: v.config as Prisma.InputJsonValue, note: `Gendannet fra ${stamp}`, createdByName: user.name } }),
  ]);
  revalidatePath("/tour-lab");
  revalidatePath(`/tour-lab/${v.tour.slug}`);
  return { ok: true };
}

/** Links a tour to a customer (or unlinks it). */
export async function setTourDeal(slug: string, dealId: string | null): Promise<Result> {
  await admin();
  await prisma.tour.update({ where: { slug }, data: { dealId } });
  revalidatePath("/tour-lab");
  return { ok: true };
}

/** Customers to pick from, by name. */
export async function searchDeals(query: string) {
  await admin();
  const q = query.trim();
  if (q.length < 2) return [];
  return prisma.deal.findMany({
    where: { OR: [{ companyName: { contains: q, mode: "insensitive" } }, { displayName: { contains: q, mode: "insensitive" } }] },
    select: { id: true, companyName: true, displayName: true },
    take: 8,
  });
}

const slugify = (s: string) =>
  s.toLowerCase().replace(/æ/g, "ae").replace(/ø/g, "oe").replace(/å/g, "aa").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

/** A new tour, started as a copy of an existing one (its design, menu and features) - then edited. */
export async function createTour(name: string, copyOf: string): Promise<Result<{ slug: string }>> {
  const user = await admin();
  const title = name.trim();
  if (!title) return { ok: false, error: "Giv touren et navn." };
  const source = await prisma.tour.findUnique({ where: { slug: copyOf }, select: { config: true, dealId: true } });
  if (!source) return { ok: false, error: "Touren, der skal kopieres, findes ikke." };
  let slug = slugify(title) || "tour";
  for (let i = 2; await prisma.tour.findUnique({ where: { slug }, select: { id: true } }); i++) slug = `${slugify(title)}-${i}`;
  const config = { ...(source.config as unknown as TourConfig), slug, title } as unknown as Prisma.InputJsonValue;
  await prisma.tour.create({
    data: { slug, name: title, config, versions: { create: { config, note: `Kopieret fra ${copyOf}`, createdByName: user.name } } },
  });
  revalidatePath("/tour-lab");
  return { ok: true, slug };
}
