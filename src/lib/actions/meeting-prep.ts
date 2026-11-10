"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getUpcomingMeetings } from "@/lib/calendar-page-data";
import { dealForMeeting, writeMeetingBrief, type BriefSource } from "@/lib/meeting-prep";

/*
 * Generator → Spørg → "Gør mig klar til møde" (see lib/meeting-prep.ts). The
 * team only (requireUser); the meeting is always looked up again here from
 * the calendar by its key - nothing the browser sends is taken as the
 * meeting itself.
 */

export type PrepMeeting = { key: string; label: string; dayKey: string; hour: number; minute: number; ownerName: string; mine: boolean; inArpo: boolean; briefId: string | null };
export type Brief = { id: string; meetingKey: string; title: string; meetingAt: string | null; body: string; sources: BriefSource[]; createdByName: string | null; createdAt: string; dealId: string | null };

const PER_HOUR = 15;
const DAYS = 21;

const asBrief = (r: { id: string; meetingKey: string; title: string; meetingAt: Date | null; body: string; sources: unknown; createdByName: string | null; createdAt: Date; dealId: string | null }): Brief => ({
  id: r.id,
  meetingKey: r.meetingKey,
  title: r.title,
  meetingAt: r.meetingAt?.toISOString() ?? null,
  body: r.body,
  sources: Array.isArray(r.sources) ? (r.sources as BriefSource[]).filter((s) => s && typeof s.url === "string" && /^https?:\/\//i.test(s.url)) : [],
  createdByName: r.createdByName,
  createdAt: r.createdAt.toISOString(),
  dealId: r.dealId,
});

/** The customer meetings from yesterday and three weeks on - the user's own marked - with the newest brief for each. */
export async function prepMeetings(): Promise<PrepMeeting[]> {
  const user = await requireUser();
  const meetings = await getUpcomingMeetings(DAYS);
  const briefs = await prisma.meetingBrief.findMany({ where: { meetingKey: { in: meetings.map((m) => m.id) } }, orderBy: { createdAt: "desc" }, select: { id: true, meetingKey: true } });
  const latest = new Map<string, string>();
  for (const b of briefs) if (!latest.has(b.meetingKey)) latest.set(b.meetingKey, b.id);
  return meetings.map((m) => ({
    key: m.id,
    label: m.label,
    dayKey: m.dayKey,
    hour: m.hour,
    minute: m.minute,
    ownerName: m.ownerName,
    mine: m.ownerUserId === user.id || (m.invitedNames ?? []).includes([user.name, user.lastName].filter(Boolean).join(" ")),
    inArpo: Boolean(m.href),
    briefId: latest.get(m.id) ?? null,
  }));
}

/** Researches the meeting and writes the brief (takes a minute or two), and keeps it. */
export async function prepareMeeting(meetingKey: string, wish = ""): Promise<{ ok: true; brief: Brief } | { ok: false; error: string }> {
  const user = await requireUser();
  const recent = await prisma.tourAiUsage.count({ where: { kind: "moedeforberedelse", userName: user.name, createdAt: { gte: new Date(Date.now() - 3600_000) } } });
  if (recent >= PER_HOUR) return { ok: false, error: "Du har forberedt mange møder den sidste time - prøv igen om lidt." };
  const m = (await getUpcomingMeetings(DAYS)).find((x) => x.id === String(meetingKey));
  if (!m) return { ok: false, error: "Mødet findes ikke i kalenderen længere." };
  const dealId = await dealForMeeting(m);
  const r = await writeMeetingBrief(user, m, dealId, typeof wish === "string" ? wish.slice(0, 600).trim() : "");
  if (!r.ok) return r;
  const meetingAt = m.hour >= 0 ? new Date(`${m.dayKey}T${String(m.hour).padStart(2, "0")}:${String(m.minute).padStart(2, "0")}:00Z`) : new Date(`${m.dayKey}T00:00:00Z`);
  const row = await prisma.meetingBrief.create({ data: { meetingKey: m.id, dealId, title: m.label.slice(0, 200), meetingAt, body: r.body, sources: r.sources, createdById: user.id, createdByName: user.name } });
  revalidatePath("/arpo/generator");
  return { ok: true, brief: asBrief(row) };
}

export async function getMeetingBrief(id: string): Promise<Brief | null> {
  await requireUser();
  const row = await prisma.meetingBrief.findUnique({ where: { id: String(id) } });
  return row ? asBrief(row) : null;
}

/** The latest briefs the team made - to open again. */
export async function recentMeetingBriefs(): Promise<Brief[]> {
  await requireUser();
  const rows = await prisma.meetingBrief.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
  return rows.map(asBrief);
}

/** Keeps the brief as a note on the deal, so it's there with the customer. */
export async function briefToNote(id: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const row = await prisma.meetingBrief.findUnique({ where: { id: String(id) } });
  if (!row) return { ok: false, error: "Forberedelsen findes ikke længere." };
  if (!row.dealId || !(await prisma.deal.findUnique({ where: { id: row.dealId }, select: { id: true } }))) return { ok: false, error: "Mødet hører ikke til en deal i Arpo." };
  const sources = asBrief(row).sources;
  const body = `Mødeforberedelse (nextviewAI) til ${row.title}\n\n${row.body.replace(/\*\*/g, "")}${sources.length ? `\n\nKilder:\n${sources.map((s) => `- ${s.title}: ${s.url}`).join("\n")}` : ""}`;
  await prisma.note.create({ data: { dealId: row.dealId, authorId: user.id, kind: "MANUAL", body: body.slice(0, 20_000) } });
  revalidatePath(`/arpo/deals/${row.dealId}`);
  return { ok: true };
}
