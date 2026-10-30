"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { approveTour, reviewRecipient, sendFixesDoneMail, sendReviewMail } from "@/lib/tour-review";
import { checkTour, type CheckItem } from "@/lib/tour-check";
import { getTourConfig } from "@/lib/tours";

/*
 * "Kundegennemsyn": a secret link (/p/<token>) we switch on for a tour, where
 * the customer looks around and leaves suggestions and bug reports right in
 * the tour. Switching it off kills the link (a new one is made next time).
 */

async function admin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin.");
  return user;
}

export async function setTourReview(slug: string, on: boolean): Promise<{ token: string | null }> {
  await admin();
  const token = on ? randomBytes(12).toString("base64url") : null;
  await prisma.tour.update({ where: { slug }, data: { reviewToken: token } });
  revalidatePath(`/arpo/tour-lab/${slug}/rediger`);
  return { token };
}

export type Feedback = { id: string; kind: string; text: string; author: string | null; href: string | null; ss: number | null; room: string | null; topic: string | null; image: string | null; device: string | null; status: string; at: string };

export async function tourFeedback(slug: string): Promise<Feedback[]> {
  await admin();
  const rows = await prisma.tourFeedback.findMany({ where: { tourSlug: slug }, orderBy: { createdAt: "desc" }, take: 300 });
  return rows.map((r) => ({ id: r.id, kind: r.kind, text: r.text, author: r.author, href: r.href, ss: r.ss, room: r.room, topic: r.topic, image: r.image, device: r.device, status: r.status, at: r.createdAt.toISOString() }));
}

/**
 * Marks a correction done (or open again). The last open one done sends the
 * customer "Jeres rettelser er lavet" - returns who got it, or why it failed
 * (the correction is marked either way).
 */
export async function setFeedbackStatus(id: string, status: "open" | "done"): Promise<{ mailedTo?: string; mailError?: string }> {
  const user = await admin();
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
  const user = await admin();
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
  await admin();
  await prisma.tourFeedback.delete({ where: { id } }).catch(() => {});
}

/* ----- "Send til gennemgang": the mail, reminders and approval ----- */

export type ReviewStatus = {
  to: string | null;
  /** The name the mail greets (Hej …). */
  toName: string | null;
  /** The deal's contact - who it goes to unless someone else is chosen. */
  contact: string | null;
  sentAt: string | null;
  remindedAt: string | null;
  reminders: number;
  approvedAt: string | null;
  approvedBy: string | null;
  open: number;
};

export async function reviewStatus(slug: string): Promise<ReviewStatus> {
  await admin();
  const t = await prisma.tour.findUnique({
    where: { slug },
    select: { reviewSentAt: true, reviewRemindedAt: true, reviewReminders: true, reviewApprovedAt: true, reviewApprovedBy: true, reviewEmail: true, reviewName: true, deal: { select: { contactEmail: true, contactName: true } } },
  });
  const open = await prisma.tourFeedback.count({ where: { tourSlug: slug, status: "open" } });
  const who = t?.deal ? reviewRecipient(t, t.deal) : null;
  return {
    to: who?.email ?? null,
    toName: who?.name ?? null,
    contact: t?.deal?.contactEmail ?? null,
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
  const user = await admin();
  try {
    const r = await sendReviewMail(slug, { id: user.id, name: user.name }, reminder, recipient ? { email: String(recipient.email ?? ""), name: String(recipient.name ?? "") } : undefined);
    revalidatePath(`/arpo/tour-lab/${slug}/rediger`);
    return { ok: true, to: r.to, token: r.token };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** We approve it ourselves (no answer from the customer) - or open the review again. */
export async function setTourApproved(slug: string, approved: boolean): Promise<void> {
  const user = await admin();
  if (approved) await approveTour(slug, { name: user.name, customer: false, actorId: user.id });
  else await prisma.tour.update({ where: { slug }, data: { reviewApprovedAt: null, reviewApprovedBy: null } });
  revalidatePath(`/arpo/tour-lab/${slug}/rediger`);
}

/** "Tjek touren" before the review mail: speed, that everything works, and nextviewAI's own look (the saved tour). */
export async function checkTourForReview(slug: string): Promise<{ ok: true; items: CheckItem[]; ai: string | null } | { ok: false; error: string }> {
  await admin();
  const config = await getTourConfig(slug);
  if (!config) return { ok: false, error: "Touren findes ikke." };
  try {
    const r = await checkTour(config, { ai: true });
    return { ok: true, ...r };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Tjekket kunne ikke køre." };
  }
}
