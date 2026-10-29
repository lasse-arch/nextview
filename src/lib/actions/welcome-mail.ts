"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizeEmail, WELCOME_DAYS } from "@/lib/customer-login";
import { sendWelcomeMail, welcomeMailFor } from "@/lib/welcome-mail";

export async function previewWelcomeMail(dealId: string) {
  await requireUser();
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId }, select: { contactEmail: true } });
  const access = deal.contactEmail ? await prisma.customerAccountDeal.findFirst({ where: { dealId, account: { email: normalizeEmail(deal.contactEmail) } } }) : null;
  // A stand-in for the real one-time link, which is only made when the mail is sent.
  const { to, subject, bodyText } = await welcomeMailFor(dealId, access ? { link: "[personligt login-link]", statsLink: "[personligt login-link til statistik]", days: WELCOME_DAYS } : null);
  return { to, subject, bodyText };
}

export async function sendWelcomeMailNow(dealId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  try {
    await sendWelcomeMail(dealId, user.id);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Velkomstmailen kunne ikke sendes." };
  }
  revalidatePath(`/arpo/deals/${dealId}`);
  return { ok: true };
}
