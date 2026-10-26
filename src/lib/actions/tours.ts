"use server";

import { tourChanged } from "@/lib/tour-cache";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { TourConfig } from "@/app/(app)/tour-lab/tours/types";
import { tourConfigProblem } from "@/lib/tour-validate";
import type { ReportShare } from "@/lib/tour-share";
import { randomBytes } from "node:crypto";
import { detachFromMpskins } from "@/lib/tour-detach";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function admin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan redigere tours.");
  return user;
}

/** Saves a tour's setup as a new version. */
export async function saveTour(slug: string, config: TourConfig, note: string): Promise<Result<{ versionId: string }>> {
  const user = await admin();
  const error = tourConfigProblem(config);
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
  tourChanged(slug);
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
  tourChanged(v.tour.slug);
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

/** Publishes a tour at /t/<slug> (for the iframe on the customer's site) - or takes it down again. */
export async function setTourPublished(slug: string, published: boolean): Promise<Result> {
  await admin();
  await prisma.tour.update({ where: { slug }, data: { published } });
  revalidatePath(`/t/${slug}`);
  tourChanged(slug);
  return { ok: true };
}

/** The editor says someone is working on the tour: a minute more on today's time for them (see "Tid og pris"). */
export async function logTourWork(slug: string, seconds: number): Promise<void> {
  const user = await admin();
  const s = Math.max(0, Math.min(120, Math.round(seconds)));
  if (!s) return;
  const day = new Date(new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" }));
  await prisma.tourWork.upsert({
    where: { tourSlug_userId_day: { tourSlug: slug, userId: user.id, day } },
    create: { tourSlug: slug, userId: user.id, userName: user.name, day, seconds: s },
    update: { seconds: { increment: s } },
  });
}

/**
 * Changes a tour's address (MPSkins' "Pretty-URL"): /t/<slug>. The old one
 * keeps working - it redirects - so iframes already on the customer's site
 * don't break. Everything kept under the old address moves along.
 */
export async function renameTourSlug(slug: string, wanted: string): Promise<Result<{ slug: string }>> {
  await admin();
  const next = slugify(wanted);
  if (next.length < 3) return { ok: false, error: "Adressen skal være mindst 3 tegn (a-z, 0-9 og -)." };
  if (next === slug) return { ok: true, slug };
  const taken = await prisma.tour.findFirst({ where: { OR: [{ slug: next }, { oldSlugs: { has: next } }] }, select: { slug: true } });
  if (taken && taken.slug !== slug) return { ok: false, error: `/t/${next} er allerede i brug.` };
  const tour = await prisma.tour.findUnique({ where: { slug }, select: { id: true, config: true, oldSlugs: true } });
  if (!tour) return { ok: false, error: "Touren findes ikke." };
  // Photos taken in the editor live under the tour's address.
  const config = JSON.parse(JSON.stringify(tour.config).replaceAll(`/tour-lab/${slug}/`, `/tour-lab/${next}/`)) as Prisma.InputJsonValue;
  await prisma.$transaction([
    prisma.tour.update({ where: { id: tour.id }, data: { slug: next, config, oldSlugs: [...new Set([...tour.oldSlugs.filter((s) => s !== next), slug])] } }),
    prisma.tourEvent.updateMany({ where: { tourSlug: slug }, data: { tourSlug: next } }),
    prisma.tourFile.updateMany({ where: { tourSlug: slug }, data: { tourSlug: next } }),
    prisma.tourStoryImage.updateMany({ where: { tourSlug: slug }, data: { tourSlug: next } }),
    prisma.tourWork.updateMany({ where: { tourSlug: slug }, data: { tourSlug: next } }),
    prisma.tourAiUsage.updateMany({ where: { tourSlug: slug }, data: { tourSlug: next } }),
  ]);
  revalidatePath("/tour-lab");
  tourChanged(slug, next);
  return { ok: true, slug: next };
}

/** Which numbers the customer sees (Resultater → Kundens rapport). */
export async function setTourShare(slug: string, share: ReportShare): Promise<Result> {
  await admin();
  await prisma.tour.update({ where: { slug }, data: { share: share as unknown as Prisma.InputJsonValue } });
  return { ok: true };
}

/** The customer's own link to their report - made the first time it's asked for. */
export async function tourShareLink(slug: string): Promise<Result<{ token: string }>> {
  await admin();
  const tour = await prisma.tour.findUnique({ where: { slug }, select: { shareToken: true } });
  if (!tour) return { ok: false, error: "Touren findes ikke." };
  if (tour.shareToken) return { ok: true, token: tour.shareToken };
  const token = randomBytes(18).toString("base64url");
  await prisma.tour.update({ where: { slug }, data: { shareToken: token } });
  return { ok: true, token };
}

/** Moves tours off MPSkins (one, or all that still use it) - each gets a new version, so it can be undone. */
export async function detachToursFromMpskins(slug?: string): Promise<Result<{ moved: number; failed: string[] }>> {
  const user = await admin();
  const tours = await prisma.tour.findMany({ where: slug ? { slug } : {}, select: { id: true, slug: true, name: true, config: true } });
  let moved = 0;
  const failed: string[] = [];
  for (const t of tours) {
    const config = { ...(t.config as unknown as TourConfig), slug: t.slug };
    if (!config.tourPage) continue;
    const r = await detachFromMpskins(config);
    if (!r.ok) {
      failed.push(`${t.name}: ${r.error}`);
      continue;
    }
    const json = r.config as unknown as Prisma.InputJsonValue;
    await prisma.$transaction([
      prisma.tour.update({ where: { id: t.id }, data: { config: json } }),
      prisma.tourVersion.create({ data: { tourId: t.id, config: json, note: `Frakoblet MPSkins (${r.links} links flyttet til Matterport)`, createdByName: user.name } }),
    ]);
    tourChanged(t.slug);
    moved++;
  }
  revalidatePath("/tour-lab");
  return { ok: true, moved, failed };
}
