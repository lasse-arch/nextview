"use server";

import { randomBytes } from "node:crypto";
import { requireTour } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { teamCan } from "@/lib/team-roles";
import { demoVisits, type DemoVisit } from "@/lib/demo-visits";

/*
 * "Fremvisning": secret, read-only links (/vis/<token>) to show a tour -
 * finished or still being made - to new customers, one link per recipient so
 * we can see who looked: when, from where, for how long, what they saw and
 * which features they went through. Only sellers (and admins) with access to
 * the tour make them, as they show a customer's tour to others.
 */

async function requireDemo(slug: string) {
  const user = await requireTour(slug);
  if (!teamCan(user, "sales")) throw new Error("Kun sælgere og admin kan dele en tour med nye kunder.");
  return user;
}

export type DemoLinkInfo = { id: string; label: string; token: string; createdAt: string; by: string | null; off: boolean; visits: DemoVisit[] };

export async function demoLinks(slug: string): Promise<DemoLinkInfo[]> {
  await requireDemo(slug);
  const links = await prisma.tourDemoLink.findMany({ where: { tourSlug: String(slug) }, orderBy: { createdAt: "desc" }, take: 50 });
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(links.map((l) => l.createdById))] } }, select: { id: true, name: true } });
  const events = await prisma.tourDemoEvent.findMany({ where: { linkId: { in: links.map((l) => l.id) } }, orderBy: { createdAt: "asc" }, take: 20_000 });
  return links.map((l) => {
    const visits = demoVisits(events.filter((e) => e.linkId === l.id));
    return { id: l.id, label: l.label, token: l.token, createdAt: l.createdAt.toISOString(), by: users.find((u) => u.id === l.createdById)?.name ?? null, off: Boolean(l.disabledAt), visits };
  });
}

export async function createDemoLink(slug: string, label: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireDemo(slug);
  const name = String(label ?? "").trim().slice(0, 120);
  if (!name) return { ok: false, error: "Skriv hvem linket er til - fx kundens navn og mødet." };
  if (!(await prisma.tour.count({ where: { slug: String(slug) } }))) return { ok: false, error: "Touren findes ikke." };
  await prisma.tourDemoLink.create({ data: { tourSlug: String(slug), token: randomBytes(15).toString("base64url"), label: name, createdById: user.id } });
  return { ok: true };
}

/** Switched off: the link stops working; what it saw is kept. */
export async function setDemoLinkOff(slug: string, id: string, off: boolean): Promise<void> {
  await requireDemo(slug);
  await prisma.tourDemoLink.updateMany({ where: { id: String(id), tourSlug: String(slug) }, data: { disabledAt: off ? new Date() : null } });
}

/** "Kan sendes som eksempel": the sellers may send this tour to new customers on SMS. */
export async function setTourShowcase(slug: string, on: boolean): Promise<void> {
  await requireDemo(slug);
  await prisma.tour.update({ where: { slug: String(slug) }, data: { showcase: Boolean(on) } });
}

export async function tourShowcase(slug: string): Promise<boolean> {
  await requireDemo(slug);
  return Boolean((await prisma.tour.findUnique({ where: { slug: String(slug) }, select: { showcase: true } }))?.showcase);
}

/** Deleted: the link stops working, and what was seen on it goes too. */
export async function deleteDemoLink(slug: string, id: string): Promise<void> {
  await requireDemo(slug);
  await prisma.tourDemoLink.deleteMany({ where: { id: String(id), tourSlug: String(slug) } });
}
