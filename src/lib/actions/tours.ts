"use server";

import { startStatsIfFirst } from "@/lib/tour-stats";
import { tourChanged } from "@/lib/tour-cache";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { tourEmbeds, type TourEmbed } from "@/lib/tour-embeds";
import { prisma } from "@/lib/db";
import type { TourConfig } from "@/app/arpo/tour-lab/tours/types";
import { tourConfigProblem } from "@/lib/tour-validate";
import type { ReportShare } from "@/lib/tour-share";
import { randomBytes } from "node:crypto";
import { detachFromMpskins } from "@/lib/tour-detach";
import { after } from "next/server";
import { makePanoCopies, withPanoCopies } from "@/lib/tour-pano-copies";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function admin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan redigere tours.");
  return user;
}

/** The 360° photos' smaller copies still missing are made after the answer (a big photo takes a few seconds). */
function panoCopiesLater(slug: string) {
  after(async () => {
    if (await makePanoCopies(slug).catch(() => 0)) tourChanged(slug);
  });
}

/** Saves a tour's setup as a new version. */
export async function saveTour(slug: string, config: TourConfig, note: string): Promise<Result<{ versionId: string }>> {
  const user = await admin();
  const error = tourConfigProblem(config);
  if (error) return { ok: false, error };
  const tour = await prisma.tour.findUnique({ where: { slug }, select: { id: true } });
  if (!tour) return { ok: false, error: "Touren findes ikke." };
  // The 360° photos' smaller copies: the ones made before go in now, new ones after the answer.
  const json = { ...(await withPanoCopies(slug, config)), slug } as unknown as Prisma.InputJsonValue;
  const version = await prisma.$transaction(async (tx) => {
    await tx.tour.update({ where: { id: tour.id }, data: { config: json, name: config.title, draft: Prisma.DbNull, draftAt: null, draftByName: null } });
    return tx.tourVersion.create({ data: { tourId: tour.id, config: json, note: note.trim() || null, createdByName: user.name }, select: { id: true } });
  });
  revalidatePath("/arpo/tour-lab");
  revalidatePath(`/arpo/tour-lab/${slug}`);
  tourChanged(slug);
  panoCopiesLater(slug);
  return { ok: true, versionId: version.id };
}

/**
 * The editor's autosave: the changes not saved yet, kept as a draft on the
 * tour - the tour itself (and /t/<slug>) is untouched until "Gem". Offered
 * back when the editor is opened again (after a lost connection, a closed
 * browser …). `null` throws the draft away.
 */
export async function saveTourDraft(slug: string, config: TourConfig | null): Promise<Result<{ at: string }>> {
  const user = await admin();
  const at = new Date();
  if (config && JSON.stringify(config).length > 3_000_000) return { ok: false, error: "Udkastet er for stort til at autogemme." };
  await prisma.tour.update({
    where: { slug },
    data: config ? { draft: { ...config, slug } as unknown as Prisma.InputJsonValue, draftAt: at, draftByName: user.name } : { draft: Prisma.DbNull, draftAt: null, draftByName: null },
  });
  return { ok: true, at: at.toISOString() };
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
  revalidatePath("/arpo/tour-lab");
  revalidatePath(`/arpo/tour-lab/${v.tour.slug}`);
  tourChanged(v.tour.slug);
  panoCopiesLater(v.tour.slug);
  return { ok: true };
}

/** Links a tour to a customer (or unlinks it). */
export async function setTourDeal(slug: string, dealId: string | null): Promise<Result> {
  await admin();
  await prisma.tour.update({ where: { slug }, data: { dealId } });
  revalidatePath("/arpo/tour-lab");
  return { ok: true };
}

/** Customers to pick from, by name - only those who have signed (a lead can't have a tour). */
export async function searchDeals(query: string) {
  await admin();
  const q = query.trim();
  if (q.length < 2) return [];
  return prisma.deal.findMany({
    where: {
      AND: [
        { OR: [{ companyName: { contains: q, mode: "insensitive" } }, { displayName: { contains: q, mode: "insensitive" } }] },
        // Signed: a contract date, or a stage after signing (customers moved over from before Arpo may have no date).
        { OR: [{ contractSignedAt: { not: null }, stage: { not: "LOST" } }, { stage: { in: ["CONTRACT_SIGNED", "FILMED", "LIVE"] } }] },
      ],
    },
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
  revalidatePath("/arpo/tour-lab");
  return { ok: true, slug };
}

/**
 * Takes a tour off the net (/t/<slug>). Putting one out is only done by
 * "Udgiv på tour.nextview360.dk" (a frozen version) - the old Arpo-only
 * switch is gone; to show a tour before that, send the review link.
 */
export async function setTourPublished(slug: string, published: boolean): Promise<Result> {
  await admin();
  if (published) return { ok: false, error: 'Udgiv på tour.nextview360.dk i stedet - eller send gennemgangslinket under Gennemgang.' };
  await prisma.tour.update({ where: { slug }, data: { published } });
  if (published) await startStatsIfFirst(slug);
  revalidatePath(`/t/${slug}`);
  tourChanged(slug);
  if (published) panoCopiesLater(slug);
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
  const config = JSON.parse(
    JSON.stringify(tour.config).replaceAll(`/tour-lab/${slug}/historie`, `/t/${next}/historie`).replaceAll(`/t/${slug}/historie`, `/t/${next}/historie`)
  ) as Prisma.InputJsonValue;
  await prisma.$transaction([
    prisma.tour.update({ where: { id: tour.id }, data: { slug: next, config, oldSlugs: [...new Set([...tour.oldSlugs.filter((s) => s !== next), slug])] } }),
    prisma.tourEvent.updateMany({ where: { tourSlug: slug }, data: { tourSlug: next } }),
    prisma.tourFile.updateMany({ where: { tourSlug: slug }, data: { tourSlug: next } }),
    prisma.tourStoryImage.updateMany({ where: { tourSlug: slug }, data: { tourSlug: next } }),
    prisma.tourWork.updateMany({ where: { tourSlug: slug }, data: { tourSlug: next } }),
    prisma.tourAiUsage.updateMany({ where: { tourSlug: slug }, data: { tourSlug: next } }),
  ]);
  revalidatePath("/arpo/tour-lab");
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
  revalidatePath("/arpo/tour-lab");
  return { ok: true, moved, failed };
}

/** How long a deleted tour stays in the papirkurv. */
const KEEP_DELETED_DAYS = 30;

/**
 * "Slet tour": the tour moves to the papirkurv - with its versions and
 * Cloudflare publications - and can be restored for 30 days. Only a tour
 * that's off the net: never one a customer's website may be showing.
 */
export async function deleteTour(slug: string, typedName: string): Promise<Result> {
  const user = await admin();
  const tour = await prisma.tour.findUnique({ where: { slug }, include: { versions: true, publications: true } });
  if (!tour) return { ok: false, error: "Touren findes ikke." };
  const names = [tour.name, (tour.config as unknown as TourConfig).title].filter(Boolean).map((n) => n.trim().toLowerCase());
  if (!names.includes(typedName.trim().toLowerCase())) return { ok: false, error: "Skriv tourens navn præcis for at slette den." };
  if (tour.published || tour.liveVersion != null) return { ok: false, error: "Touren er udgivet. Tag den af nettet under Del og udgiv først - så forsvinder den ikke fra en kundes hjemmeside uden varsel." };
  const { versions, publications, ...row } = tour;
  await prisma.$transaction([
    prisma.deletedTour.create({ data: { slug, name: tour.name, deletedByName: user.name, data: JSON.parse(JSON.stringify({ tour: row, versions, publications })) as Prisma.InputJsonValue } }),
    prisma.tour.delete({ where: { id: tour.id } }),
  ]);
  revalidatePath("/arpo/tour-lab");
  return { ok: true };
}

/** Back from the papirkurv - as it was, versions and publications included. */
export async function restoreTour(deletedId: string): Promise<Result<{ slug: string }>> {
  await admin();
  const d = await prisma.deletedTour.findUnique({ where: { id: deletedId } });
  if (!d || d.restoredAt) return { ok: false, error: "Touren er ikke i papirkurven." };
  if (await prisma.tour.findUnique({ where: { slug: d.slug }, select: { id: true } })) return { ok: false, error: `Der findes allerede en tour med adressen "${d.slug}".` };
  const data = d.data as unknown as { tour: Prisma.TourUncheckedCreateInput; versions: Prisma.TourVersionUncheckedCreateInput[]; publications: Prisma.TourPublicationUncheckedCreateInput[] };
  // The customer may have been removed meanwhile - then the tour comes back without one.
  const dealId = data.tour.dealId && (await prisma.deal.findUnique({ where: { id: data.tour.dealId }, select: { id: true } })) ? data.tour.dealId : null;
  await prisma.$transaction([
    // An empty JSON field (no draft, default sharing) is left out - Prisma takes no plain null there.
    prisma.tour.create({ data: { ...data.tour, draft: data.tour.draft ?? undefined, share: data.tour.share ?? undefined, dealId, published: false, liveVersion: null } }),
    ...(data.versions.length ? [prisma.tourVersion.createMany({ data: data.versions })] : []),
    ...(data.publications.length ? [prisma.tourPublication.createMany({ data: data.publications })] : []),
    prisma.deletedTour.update({ where: { id: d.id }, data: { restoredAt: new Date() } }),
  ]);
  revalidatePath("/arpo/tour-lab");
  return { ok: true, slug: d.slug };
}

/** The papirkurv: tours deleted within the last 30 days (older ones are let go here). */
export async function deletedTours() {
  await admin();
  const cutoff = new Date(Date.now() - KEEP_DELETED_DAYS * 86_400_000);
  await prisma.deletedTour.deleteMany({ where: { OR: [{ createdAt: { lt: cutoff } }, { restoredAt: { not: null } }] } }).catch(() => {});
  return prisma.deletedTour.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, slug: true, name: true, deletedByName: true, createdAt: true } });
}

/** "Her er touren vist": the pages showing the tour in a frame (last 90 days) - for the editor's Del og udgiv. */
export async function tourEmbedsOf(slug: string): Promise<TourEmbed[]> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin.");
  return tourEmbeds([slug]);
}
