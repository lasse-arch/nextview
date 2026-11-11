"use server";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeCallBrief } from "@/lib/call-prep";
import type { BriefSource } from "@/lib/web-brief";

/* Generator → "Første opkald" (lib/call-prep.ts): the team only, one link per call (the page does them in a row), at most 40 an hour. */

export type CallCard = { ok: true; site: string; body: string; sources: BriefSource[]; deal: { id: string; name: string; stage: string } | null } | { ok: false; site: string; error: string };

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
  return { ok: true, site: r.site ?? site, body: r.body, sources: r.sources, deal: r.deal ?? null };
}
