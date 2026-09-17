"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

const MAX_DATA_URL_LENGTH = 400_000;

export async function updateOwnAvatar(dataUrl: string) {
  const user = await requireUser();

  if (!dataUrl.startsWith("data:image/")) {
    throw new Error("Ugyldigt billede.");
  }
  if (dataUrl.length > MAX_DATA_URL_LENGTH) {
    throw new Error("Billedet er for stort.");
  }

  await prisma.user.update({ where: { id: user.id }, data: { avatarUrl: dataUrl } });
  revalidatePath("/", "layout");
}

export async function removeOwnAvatar() {
  const user = await requireUser();
  await prisma.user.update({ where: { id: user.id }, data: { avatarUrl: null } });
  revalidatePath("/", "layout");
}
