"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { syncInboundEmails, type EmailSyncSummary } from "@/lib/email-sync-service";
import type { EmailProvider } from "@prisma/client";

export async function disconnectEmailAccount(provider: EmailProvider) {
  const user = await requireUser();
  await prisma.emailAccount.deleteMany({ where: { userId: user.id, provider } });
  revalidatePath("/settings/email");
}

export async function syncInboundEmailsNow(): Promise<EmailSyncSummary> {
  await requireUser();
  const summary = await syncInboundEmails();
  revalidatePath("/settings/email");
  revalidatePath("/deals");
  return summary;
}
