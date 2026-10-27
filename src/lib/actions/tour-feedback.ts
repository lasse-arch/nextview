"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

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

export type Feedback = { id: string; kind: string; text: string; author: string | null; href: string | null; ss: number | null; room: string | null; image: string | null; device: string | null; status: string; at: string };

export async function tourFeedback(slug: string): Promise<Feedback[]> {
  await admin();
  const rows = await prisma.tourFeedback.findMany({ where: { tourSlug: slug }, orderBy: { createdAt: "desc" }, take: 300 });
  return rows.map((r) => ({ id: r.id, kind: r.kind, text: r.text, author: r.author, href: r.href, ss: r.ss, room: r.room, image: r.image, device: r.device, status: r.status, at: r.createdAt.toISOString() }));
}

export async function setFeedbackStatus(id: string, status: "open" | "done"): Promise<void> {
  await admin();
  await prisma.tourFeedback.update({ where: { id }, data: { status } });
}

export async function deleteFeedback(id: string): Promise<void> {
  await admin();
  await prisma.tourFeedback.delete({ where: { id } }).catch(() => {});
}
