"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

const MAX_DATA_URL_LENGTH = 400_000;

function assertCanEditAvatar(user: { id: string; role: string }, targetUserId: string) {
  if (targetUserId !== user.id && user.role !== "ADMIN") {
    throw new Error("Du kan kun ændre dit eget profilbillede.");
  }
}

export async function updateOwnAvatar(dataUrl: string, targetUserId?: string) {
  const user = await requireUser();
  const target = targetUserId ?? user.id;
  assertCanEditAvatar(user, target);

  if (!dataUrl.startsWith("data:image/")) {
    throw new Error("Ugyldigt billede.");
  }
  if (dataUrl.length > MAX_DATA_URL_LENGTH) {
    throw new Error("Billedet er for stort.");
  }

  await prisma.user.update({ where: { id: target }, data: { avatarUrl: dataUrl } });
  revalidatePath("/", "layout");
  revalidatePath("/users");
}

export async function removeOwnAvatar(targetUserId?: string) {
  const user = await requireUser();
  const target = targetUserId ?? user.id;
  assertCanEditAvatar(user, target);

  await prisma.user.update({ where: { id: target }, data: { avatarUrl: null } });
  revalidatePath("/", "layout");
  revalidatePath("/users");
}

export async function updateOwnContactInfo(formData: FormData) {
  const user = await requireUser();
  const phone = String(formData.get("phone") || "").trim() || null;
  const lastName = String(formData.get("lastName") || "").trim() || null;
  await prisma.user.update({ where: { id: user.id }, data: { phone, lastName } });
  revalidatePath("/profile");
}
