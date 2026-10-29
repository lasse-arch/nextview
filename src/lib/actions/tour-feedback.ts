"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { approveTour, sendFixesDoneMail, sendReviewMail } from "@/lib/tour-review";

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

export async function deleteFeedback(id: string): Promise<void> {
  await admin();
  await prisma.tourFeedback.delete({ where: { id } }).catch(() => {});
}

/* ----- "Send til gennemgang": the mail, reminders and approval ----- */

export type ReviewStatus = {
  to: string | null;
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
    select: { reviewSentAt: true, reviewRemindedAt: true, reviewReminders: true, reviewApprovedAt: true, reviewApprovedBy: true, deal: { select: { contactEmail: true } } },
  });
  const open = await prisma.tourFeedback.count({ where: { tourSlug: slug, status: "open" } });
  return {
    to: t?.deal?.contactEmail ?? null,
    sentAt: t?.reviewSentAt?.toISOString() ?? null,
    remindedAt: t?.reviewRemindedAt?.toISOString() ?? null,
    reminders: t?.reviewReminders ?? 0,
    approvedAt: t?.reviewApprovedAt?.toISOString() ?? null,
    approvedBy: t?.reviewApprovedBy ?? null,
    open,
  };
}

/** Sends the review mail to the customer - or a reminder. */
export async function sendForReview(slug: string, reminder: boolean): Promise<{ ok: true; to: string; token: string } | { ok: false; error: string }> {
  const user = await admin();
  try {
    const r = await sendReviewMail(slug, { id: user.id, name: user.name }, reminder);
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
