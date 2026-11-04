"use server";

import { noteTokenOf } from "@/lib/review-tokens";
import { teamCan } from "@/lib/team-roles";
import type { Role } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireTeam, requireTour } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { approveTour, reviewRecipient, sendFixesDoneMail, sendReviewMail } from "@/lib/tour-review";
import { filmingTime } from "@/lib/filming-time";
import { checkTour, type AiNote, type CheckItem } from "@/lib/tour-check";
import { getTourConfig } from "@/lib/tours";

/*
 * "Kundegennemsyn": a secret link (/p/<token>) we switch on for a tour, where
 * the customer looks around and leaves suggestions and bug reports right in
 * the tour. Switching it off kills the link (a new one is made next time).
 */


export async function setTourReview(slug: string, on: boolean): Promise<{ token: string | null }> {
  const user = await requireTour(slug);
  // New links both: switched off (or on again), the old ones stop working.
  const token = on ? randomBytes(12).toString("base64url") : null;
  await prisma.tour.update({ where: { slug }, data: { reviewToken: token, reviewNoteToken: null } });
  revalidatePath(`/arpo/tour-lab/${slug}/rediger`);
  return { token: token ? await teamReviewLink(user, slug, token) : null };
}

/** The recipient asked for is the one already set (the deal's contact, or the chosen reviewer) - nothing new chosen. */
async function sameRecipient(slug: string, email: string): Promise<boolean> {
  const e = String(email ?? "").trim().toLowerCase();
  if (!e) return true; // empty = back to the deal's contact
  const t = await prisma.tour.findUnique({ where: { slug }, select: { reviewEmail: true, reviewEmail2: true, deal: { select: { contactEmail: true } } } });
  return [t?.reviewEmail, t?.reviewEmail2, t?.deal?.contactEmail].some((x) => x && x.trim().toLowerCase() === e);
}

/**
 * The review link the team sees: the one that can approve for those who may
 * put a customer live (admins, sellers) - the notes-only one for developers,
 * so they can't approve in the customer's name.
 */
async function teamReviewLink(user: { role: Role; extraRoles: Role[] }, slug: string, full: string): Promise<string> {
  return teamCan(user, "numbers") ? full : ((await noteTokenOf(slug)) ?? "");
}

export type Feedback = { id: string; kind: string; text: string; author: string | null; href: string | null; ss: number | null; room: string | null; topic: string | null; image: string | null; device: string | null; status: string; at: string };

export async function tourFeedback(slug: string): Promise<Feedback[]> {
  await requireTour(slug);
  const rows = await prisma.tourFeedback.findMany({ where: { tourSlug: slug }, orderBy: { createdAt: "desc" }, take: 300 });
  return rows.map((r) => ({ id: r.id, kind: r.kind, text: r.text, author: r.author, href: r.href, ss: r.ss, room: r.room, topic: r.topic, image: r.image, device: r.device, status: r.status, at: r.createdAt.toISOString() }));
}

/**
 * Marks a correction done (or open again). The last open one done sends the
 * customer "Jeres rettelser er lavet" - returns who got it, or why it failed
 * (the correction is marked either way).
 */
export async function setFeedbackStatus(id: string, status: "open" | "done"): Promise<{ mailedTo?: string; mailError?: string }> {
  const user = await requireTeam("tours");
  const fb = await prisma.tourFeedback.findUnique({ where: { id }, select: { tourSlug: true } });
  if (!fb) throw new Error("Findes ikke.");
  await requireTour(fb.tourSlug);
  const row = await prisma.tourFeedback.update({ where: { id }, data: { status }, select: { tourSlug: true } });
  if (status !== "done") return {};
  try {
    const to = await sendFixesDoneMail(row.tourSlug, { id: user.id, name: user.name });
    return to ? { mailedTo: to } : {};
  } catch (err) {
    return { mailError: err instanceof Error ? err.message : String(err) };
  }
}

/** "Send 'Jeres rettelser er lavet' nu": the same mail, by hand. */
export async function sendFixesDone(slug: string): Promise<{ ok: true; to: string } | { ok: false; error: string }> {
  const user = await requireTour(slug);
  try {
    const to = await sendFixesDoneMail(slug, { id: user.id, name: user.name }, true);
    if (!to) return { ok: false, error: "Mailen blev ikke sendt." };
    revalidatePath(`/arpo/tour-lab/${slug}/rediger`);
    return { ok: true, to };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function deleteFeedback(id: string): Promise<void> {
  await requireTeam("tours");
  const fb = await prisma.tourFeedback.findUnique({ where: { id }, select: { tourSlug: true } });
  if (!fb) return;
  await requireTour(fb.tourSlug);
  await prisma.tourFeedback.delete({ where: { id } }).catch(() => {});
}

/* ----- "Send til gennemgang": the mail, reminders and approval ----- */

export type ReviewStatus = {
  to: string | null;
  /** The name the mail greets (Hej …). */
  toName: string | null;
  /** The deal's contact - who it goes to unless someone else is chosen. */
  contact: string | null;
  /** The deal, and whether its filming time is still missing (needed before the review mail: approving makes it Live). */
  dealId: string | null;
  filmingMissing: boolean;
  sentAt: string | null;
  remindedAt: string | null;
  reminders: number;
  approvedAt: string | null;
  approvedBy: string | null;
  open: number;
  /** A second person who gets the same mails (and the customer page). */
  to2: string | null;
  to2Name: string | null;
};

export async function reviewStatus(slug: string): Promise<ReviewStatus> {
  await requireTour(slug);
  const t = await prisma.tour.findUnique({
    where: { slug },
    select: { reviewSentAt: true, reviewRemindedAt: true, reviewReminders: true, reviewApprovedAt: true, reviewApprovedBy: true, reviewEmail: true, reviewName: true, reviewEmail2: true, reviewName2: true, deal: { select: { id: true, contactEmail: true, contactName: true, filmingActualMinutes: true } } },
  });
  const open = await prisma.tourFeedback.count({ where: { tourSlug: slug, status: "open" } });
  const who = t?.deal ? reviewRecipient(t, t.deal) : null;
  return {
    to: who?.email ?? null,
    toName: who?.name ?? null,
    to2: t?.reviewEmail2 ?? null,
    to2Name: t?.reviewName2 ?? null,
    contact: t?.deal?.contactEmail ?? null,
    dealId: t?.deal?.id ?? null,
    filmingMissing: t?.deal ? (await filmingTime(t.deal)).minutes == null : false,
    sentAt: t?.reviewSentAt?.toISOString() ?? null,
    remindedAt: t?.reviewRemindedAt?.toISOString() ?? null,
    reminders: t?.reviewReminders ?? 0,
    approvedAt: t?.reviewApprovedAt?.toISOString() ?? null,
    approvedBy: t?.reviewApprovedBy ?? null,
    open,
  };
}

/** Sends the review mail to the customer - or a reminder. */
export async function sendForReview(slug: string, reminder: boolean, recipient?: { email: string; name: string }): Promise<{ ok: true; to: string; token: string } | { ok: false; error: string }> {
  const user = await requireTour(slug);
  // Who gets the link that approves (and access to the customer's page) is chosen by admins and sellers only.
  if (recipient && !teamCan(user, "numbers") && !(await sameRecipient(slug, recipient.email))) return { ok: false, error: "Kun en admin eller sælger kan sende gennemgangen til en anden end kundens kontaktperson." };
  try {
    const r = await sendReviewMail(slug, { id: user.id, name: user.name }, reminder, recipient ? { email: String(recipient.email ?? ""), name: String(recipient.name ?? "") } : undefined);
    revalidatePath(`/arpo/tour-lab/${slug}/rediger`);
    return { ok: true, to: r.to, token: await teamReviewLink(user, slug, r.token) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** We approve it ourselves (no answer from the customer) - or open the review again. */
export async function setTourApproved(slug: string, approved: boolean): Promise<void> {
  const user = await requireTour(slug);
  if (approved) await approveTour(slug, { name: user.name, customer: false, actorId: user.id });
  else await prisma.tour.update({ where: { slug }, data: { reviewApprovedAt: null, reviewApprovedBy: null } });
  revalidatePath(`/arpo/tour-lab/${slug}/rediger`);
}

/** "Tjek touren" before the review mail: speed, that everything works, and nextviewAI's own look (the saved tour). */
export async function checkTourForReview(slug: string): Promise<{ ok: true; items: CheckItem[]; ai: AiNote[] | null } | { ok: false; error: string }> {
  await requireTour(slug);
  const config = await getTourConfig(slug);
  if (!config) return { ok: false, error: "Touren findes ikke." };
  try {
    const r = await checkTour(config, { ai: true });
    // Kept on the tour: shown again next time, and its suggestions can be run again.
    const saved: SavedCheck = { at: new Date().toISOString(), items: r.items, ai: r.ai, done: [] };
    await prisma.tour.update({ where: { slug }, data: { reviewCheck: saved as unknown as Prisma.InputJsonValue } });
    return { ok: true, ...r };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Tjekket kunne ikke køre." };
  }
}

/** The last "Tjek touren", as kept on the tour - and which of its suggestions are ticked off. */
export type SavedCheck = { at: string; items: CheckItem[]; ai: AiNote[] | null; done: number[] };

export async function lastTourCheck(slug: string): Promise<SavedCheck | null> {
  await requireTour(slug);
  const t = await prisma.tour.findUnique({ where: { slug }, select: { reviewCheck: true } });
  const c = t?.reviewCheck as unknown as SavedCheck | null;
  return c && Array.isArray(c.items) ? { ...c, done: Array.isArray(c.done) ? c.done : [] } : null;
}

/** Which of the last check's suggestions are done (ticked by hand, or fixed by nextviewAI). */
export async function setTourCheckDone(slug: string, done: number[]): Promise<void> {
  await requireTour(slug);
  const t = await prisma.tour.findUnique({ where: { slug }, select: { reviewCheck: true } });
  const c = t?.reviewCheck as unknown as SavedCheck | null;
  if (!c) return;
  const clean = [...new Set(done.filter((n) => Number.isInteger(n) && n >= 0 && n < (c.ai?.length ?? 0)))];
  await prisma.tour.update({ where: { slug }, data: { reviewCheck: { ...c, done: clean } as unknown as Prisma.InputJsonValue } });
}

/** "Gem" on who the review mails go to - without sending anything. An empty e-mail = the deal's contact again. */
export async function setReviewRecipient(slug: string, email: string, name: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireTour(slug);
  if (!teamCan(user, "numbers")) return { ok: false, error: "Kun en admin eller sælger kan vælge, hvem gennemgangen sendes til." };
  const e = email.trim().toLowerCase();
  if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { ok: false, error: "Skriv en gyldig e-mail." };
  const tour = await prisma.tour.findUnique({ where: { slug }, select: { id: true } });
  if (!tour) return { ok: false, error: "Touren findes ikke." };
  await prisma.tour.update({ where: { slug }, data: e ? { reviewEmail: e.slice(0, 200), reviewName: name.trim().slice(0, 120) || null } : { reviewEmail: null, reviewName: null } });
  return { ok: true };
}

/**
 * "Send også til en mere": a second person who gets the review mails and the
 * customer page too (e.g. the head and the director). Chosen by admins and
 * sellers only, like the first. An empty e-mail removes them.
 */
export async function setReviewRecipient2(slug: string, email: string, name: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireTour(slug);
  if (!teamCan(user, "numbers")) return { ok: false, error: "Kun en admin eller sælger kan vælge, hvem gennemgangen sendes til." };
  const e = String(email ?? "").trim().toLowerCase();
  if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { ok: false, error: "Skriv en gyldig e-mail." };
  const tour = await prisma.tour.findUnique({ where: { slug }, select: { id: true } });
  if (!tour) return { ok: false, error: "Touren findes ikke." };
  await prisma.tour.update({ where: { slug }, data: e ? { reviewEmail2: e.slice(0, 200), reviewName2: String(name ?? "").trim().slice(0, 120) || null } : { reviewEmail2: null, reviewName2: null } });
  revalidatePath(`/arpo/tour-lab/${slug}/rediger`);
  return { ok: true };
}
