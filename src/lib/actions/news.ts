"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

/** Posting a feature announcement is admin-only - everyone else just reads. */
export async function createNewsPost(input: {
  title: string;
  body: string;
  screenshotUrl: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  if (user.role !== "ADMIN") return { ok: false, error: "Kun admin kan oprette nyheder." };

  const title = input.title.trim();
  const body = input.body.trim();
  if (!title || !body) return { ok: false, error: "Udfyld både titel og tekst." };

  await prisma.newsPost.create({
    data: { title, body, screenshotUrl: input.screenshotUrl, createdById: user.id },
  });
  // The poster shouldn't see their own post as "unread" the moment they land back on the page.
  await prisma.user.update({ where: { id: user.id }, data: { newsReadAt: new Date() } });

  revalidatePath("/nyheder");
  return { ok: true };
}

export async function deleteNewsPost(postId: string): Promise<void> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Kun admin kan slette nyheder.");
  await prisma.newsPost.delete({ where: { id: postId } });
  revalidatePath("/nyheder");
}

/** Called when /nyheder is opened, so the header badge clears. */
export async function markNewsRead(): Promise<void> {
  const user = await requireUser();
  await prisma.user.update({ where: { id: user.id }, data: { newsReadAt: new Date() } });
  revalidatePath("/nyheder");
}

export async function getUnreadNewsCount(userId: string, newsReadAt: Date | null): Promise<number> {
  return prisma.newsPost.count({
    where: { createdAt: { gt: newsReadAt ?? new Date(0) }, createdById: { not: userId } },
  });
}
