"use server";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeCallBrief } from "@/lib/call-prep";
import type { BriefSource } from "@/lib/web-brief";

/* Generator → "Første opkald" (lib/call-prep.ts): the team only, one link per call (the page does them in a row), at most 40 an hour. */

export type CallCard = { ok: true; id?: string; site: string; body: string; sources: BriefSource[]; deal: { id: string; name: string; stage: string } | null; by?: string; at?: string } | { ok: false; site: string; error: string };

const PER_HOUR = 40;

export async function prepareCall(link: string): Promise<CallCard> {
  const user = await requireUser();
  const url = typeof link === "string" ? link.trim().slice(0, 300) : "";
  const site = url.replace(/^https?:\/\//i, "").replace(/\/.*$/, "") || url;
  if (!url) return { ok: false, site, error: "Tomt link." };
  const n = await prisma.tourAiUsage.count({ where: { kind: "opkaldsforberedelse", userName: user.name, createdAt: { gte: new Date(Date.now() - 3600_000) } } });
  if (n >= PER_HOUR) return { ok: false, site, error: "Du har forberedt mange opkald den sidste time - prøv igen om lidt." };
  const r = await writeCallBrief(user, url);
  if (!r.ok) return { ok: false, site: r.site ?? site, error: r.error };
  // Kept: who made it and when, so it can be found again (Tidligere opkald).
  const saved = await prisma.callBrief
    .create({ data: { userId: user.id, site: (r.site ?? site).slice(0, 200), url, body: r.body, sources: r.sources as object[], dealId: r.deal?.id ?? null }, select: { id: true, createdAt: true } })
    .catch(() => null);
  return { ok: true, id: saved?.id, site: r.site ?? site, body: r.body, sources: r.sources, deal: r.deal ?? null, by: user.name, at: (saved?.createdAt ?? new Date()).toISOString() };
}

export type CallBriefRow = { id: string; site: string; by: string; userId: string; at: string; deal: { id: string; name: string; stage: string } | null };

/** "Tidligere opkald": the cards made - your own, or (admins) anyone's or everyone's. Newest first, at most 200. */
export async function listCallBriefs(filter: { userId?: string | null; q?: string } = {}): Promise<{ rows: CallBriefRow[]; people: { id: string; name: string }[]; admin: boolean }> {
  const user = await requireUser();
  const admin = user.role === "ADMIN";
  const who = admin ? (typeof filter.userId === "string" && filter.userId ? filter.userId : undefined) : user.id;
  const q = typeof filter.q === "string" ? filter.q.trim().slice(0, 100) : "";
  const [rows, people] = await Promise.all([
    prisma.callBrief.findMany({
      where: { ...(who ? { userId: who } : {}), ...(q ? { site: { contains: q, mode: "insensitive" as const } } : {}) },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, site: true, userId: true, createdAt: true, user: { select: { name: true } }, deal: { select: { id: true, companyName: true, displayName: true, stage: true } } },
    }),
    admin ? prisma.user.findMany({ where: { callBriefs: { some: {} } }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);
  return {
    admin,
    people,
    rows: rows.map((r) => ({ id: r.id, site: r.site, by: r.user.name, userId: r.userId, at: r.createdAt.toISOString(), deal: r.deal ? { id: r.deal.id, name: r.deal.displayName || r.deal.companyName, stage: r.deal.stage } : null })),
  };
}

/** One saved card - your own, or any for an admin. */
export async function getCallBrief(id: string): Promise<CallCard> {
  const user = await requireUser();
  const r = await prisma.callBrief.findUnique({ where: { id: String(id) }, include: { user: { select: { name: true } }, deal: { select: { id: true, companyName: true, displayName: true, stage: true } } } });
  if (!r || (user.role !== "ADMIN" && r.userId !== user.id)) return { ok: false, site: "", error: "Kortet findes ikke." };
  return {
    ok: true,
    id: r.id,
    site: r.site,
    body: r.body,
    sources: (Array.isArray(r.sources) ? r.sources : []) as BriefSource[],
    deal: r.deal ? { id: r.deal.id, name: r.deal.displayName || r.deal.companyName, stage: r.deal.stage } : null,
    by: r.user.name,
    at: r.createdAt.toISOString(),
  };
}
