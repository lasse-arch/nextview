"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizeEmail, WELCOME_DAYS } from "@/lib/customer-login";
import { sendWelcomeMail, welcomeMailFor, welcomeMailMissing } from "@/lib/welcome-mail";

export async function previewWelcomeMail(dealId: string) {
  await requireUser();
  const deal = await prisma.deal.findUniqueOrThrow({
    where: { id: dealId },
    select: { contactEmail: true, tours: { select: { reviewEmail: true, published: true } }, items: { where: { url: { not: null } }, select: { id: true } } },
  });
  const access = deal.contactEmail ? await prisma.customerAccountDeal.findFirst({ where: { dealId, account: { email: normalizeEmail(deal.contactEmail) } } }) : null;
  const known = access ? (await prisma.systemMail.count({ where: { dealId, accountId: access.accountId, kind: { in: ["review", "review_reminder"] }, error: null } })) > 0 : false;
  // A stand-in for the real one-time link, which is only made when the mail is sent.
  const { to, subject, bodyText } = await welcomeMailFor(dealId, access ? { link: "[personligt login-link]", statsLink: "[personligt login-link til statistik]", days: WELCOME_DAYS, known } : null);
  // Whoever the tour went to for review gets their own copy (with their own login).
  const also = [...new Set(deal.tours.map((t) => t.reviewEmail).filter((e): e is string => Boolean(e) && e !== normalizeEmail(deal.contactEmail ?? "")))];
  // What's missing before it may be sent - it can't go out until it's in place.
  const missing = await welcomeMailMissing(dealId);
  return { to: also.length ? [to, ...also].join(" og ") : to, subject, bodyText, missing };
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
