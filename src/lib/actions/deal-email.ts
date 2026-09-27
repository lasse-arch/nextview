"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendGmailMessage } from "@/lib/gmail";
import { getAppBaseUrl } from "@/lib/email-oauth";
import { resolveTemplatePlaceholders } from "@/lib/email-templates";
import { logActivity } from "@/lib/activity";
import { dealName } from "@/lib/labels";
import { createEmailFollowUpTask } from "@/lib/task-automation";

/**
 * Sends an email from the deal page, as the CURRENT user's own connected
 * Gmail (not a shared company inbox) - {{placeholders}} in the subject/body
 * are resolved first, then a tracking pixel is appended so the deal's email
 * history can show whether/when it was opened. `ccUserIds` cc's colleagues
 * (e.g. Gustav or Victor) by their own account email, not arbitrary text -
 * so it's always a real, connected person on the team, not a typo. Creates a
 * short follow-up task on the deal, assigned to the sender, so a sent email
 * doesn't just disappear into the void if the customer never replies.
 */
export async function sendTemplatedEmailAction(
  dealId: string,
  subjectRaw: string,
  bodyHtmlRaw: string,
  ccUserIds: string[] = []
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();

  const account = await prisma.emailAccount.findFirst({ where: { userId: user.id, provider: "GOOGLE" } });
  if (!account) {
    return { ok: false, error: "Forbind din Gmail-konto under Indstillinger → E-mail for at kunne sende herfra." };
  }

  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  const recipient = deal.contactEmail || deal.invoiceEmail;
  if (!recipient) return { ok: false, error: "Dealen har ingen kontakt-e-mail at sende til." };

  const ccUsers = ccUserIds.length > 0 ? await prisma.user.findMany({ where: { id: { in: ccUserIds } }, select: { email: true } }) : [];
  const ccEmails = ccUsers.map((u) => u.email);

  const ctx = {
    deal: { companyName: deal.companyName, displayName: deal.displayName, contactName: deal.contactName },
    seller: { name: user.name, lastName: user.lastName, phone: user.phone, email: user.email },
  };
  const subject = resolveTemplatePlaceholders(subjectRaw, ctx);
  const body = resolveTemplatePlaceholders(bodyHtmlRaw, ctx);

  const plainText = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const trackingId = crypto.randomUUID();
  const pixel = `<img src="${getAppBaseUrl()}/api/track/email-open/${trackingId}" width="1" height="1" style="display:none" alt="" />`;
  const bodyHtml = `${body}${pixel}`;

  let sendResult: { id: string };
  try {
    sendResult = await sendGmailMessage(account, {
      to: [recipient],
      cc: ccEmails,
      subject,
      bodyText: plainText,
      bodyHtml,
      fromName: [user.name, user.lastName].filter(Boolean).join(" "),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Kunne ikke sende e-mailen." };
  }

  await prisma.emailMessage.create({
    data: {
      dealId,
      provider: "GOOGLE",
      messageId: sendResult.id,
      direction: "OUTBOUND",
      fromAddress: account.email,
      toAddresses: recipient,
      ccAddresses: ccEmails.length > 0 ? ccEmails.join(", ") : null,
      subject,
      bodyText: plainText,
      sentAt: new Date(),
      trackingId,
    },
  });

  await createEmailFollowUpTask(dealId, user.id, subject);

  await logActivity({
    type: "EMAIL_SENT",
    message: `${user.name} sendte en e-mail til ${dealName(deal)}`,
    actorId: user.id,
    dealId,
  });

  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/opgaver");
  return { ok: true };
}
