"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import type { EmailProvider } from "@prisma/client";

export async function disconnectEmailAccount(provider: EmailProvider) {
  const user = await requireUser();
  await prisma.emailAccount.deleteMany({ where: { userId: user.id, provider } });
  revalidatePath("/settings/email");
}
