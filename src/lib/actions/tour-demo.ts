"use server";

import { randomBytes } from "node:crypto";
import { requireTour } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { teamCan } from "@/lib/team-roles";

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

export type DemoVisit = {
  session: string;
  start: string;
  /** Seconds between the first and the last thing that happened. */
  seconds: number;
  device: string | null;
  where: string | null;
  from: string | null;
  /** Rooms and places seen, in order (each once). */
  seen: string[];
  /** The walk-through: how far they got, and what they tried. */
  features: { seen: number; of: number } | null;
  tried: string[];
  /** Contact buttons pressed (the walk-through's or the tour's). */
  contact: boolean;
};

export type DemoLinkInfo = { id: string; label: string; token: string; createdAt: string; by: string | null; off: boolean; visits: DemoVisit[] };

const COUNTRY: Record<string, string> = { DK: "Danmark", DE: "Tyskland", SE: "Sverige", NO: "Norge", GB: "Storbritannien", NL: "Holland", US: "USA" };
const ROOM_EVENTS = new Set(["room_view", "place_click", "menu_click", "place_card_view", "pano_open"]);

export async function demoLinks(slug: string): Promise<DemoLinkInfo[]> {
  await requireDemo(slug);
  const links = await prisma.tourDemoLink.findMany({ where: { tourSlug: String(slug) }, orderBy: { createdAt: "desc" }, take: 50 });
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(links.map((l) => l.createdById))] } }, select: { id: true, name: true } });
  const events = await prisma.tourDemoEvent.findMany({ where: { linkId: { in: links.map((l) => l.id) } }, orderBy: { createdAt: "asc" }, take: 20_000 });
  return links.map((l) => {
    const sessions = new Map<string, typeof events>();
    for (const e of events) if (e.linkId === l.id) sessions.set(e.session, [...(sessions.get(e.session) ?? []), e]);
    const visits: DemoVisit[] = [...sessions.entries()].map(([session, ev]) => {
      const first = ev[0];
      const last = ev[ev.length - 1];
      const close = [...ev].reverse().find((e) => e.name === "features_close");
      const seen = [...new Set(ev.filter((e) => ROOM_EVENTS.has(e.name) && e.label).map((e) => e.label!))];
      const place = [first.city, first.country ? (COUNTRY[first.country] ?? first.country) : null].filter(Boolean).join(", ");
      return {
        session,
        start: first.createdAt.toISOString(),
        seconds: Math.round((last.createdAt.getTime() - first.createdAt.getTime()) / 1000),
        device: first.device,
        where: place || null,
        from: ev.find((e) => e.referrer)?.referrer ?? null,
        seen,
        features: close?.label ? (([a, b]) => (a && b ? { seen: a, of: b } : null))(close.label.split("/").map(Number)) : null,
        tried: [...new Set(ev.filter((e) => e.name === "features_try" && e.label).map((e) => e.label!))],
        contact: ev.some((e) => e.name === "contact_click" || e.name === "demo_contact" || e.name === "cta_click"),
      };
    });
    visits.sort((a, b) => b.start.localeCompare(a.start));
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
