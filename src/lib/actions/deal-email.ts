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

/** 25MB - Gmail's own limit on a single outgoing message (including the
 * base64-inflated size of every attachment combined). */
const MAX_ATTACHMENTS_BYTES = 25 * 1024 * 1024;

/** The "Indhold" box is a plain `<textarea>` - what's typed (or saved as a
 * template) is ordinary text with real line breaks, not HTML. Dropped
 * straight into an HTML email body as-is, those line breaks just vanish
 * (HTML collapses whitespace), so a multi-paragraph, bulleted email reads as
 * one unbroken wall of text in the recipient's inbox - confirmed from a real
 * sent email. Escapes HTML special characters first (so a stray "<" or "&"
 * in someone's text can't break the markup), then turns blank-line gaps into
 * paragraphs and single line breaks into <br>. Skipped for the rare body
 * that already contains real markup (e.g. an older template written with
 * actual <p>/<br> tags), left untouched rather than double-escaped. */
function looksLikeHtml(text: string): boolean {
  return /<[a-z][\s\S]*>/i.test(text);
}

function plainTextToHtml(text: string): string {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/**
 * Sends an email from the deal page, as the CURRENT user's own connected
 * Gmail (not a shared company inbox) - {{placeholders}} in the subject/body
 * are resolved first, then a tracking pixel is appended so the deal's email
 * history can show whether/when it was opened. `ccUserIds` cc's colleagues
 * (e.g. Gustav or Victor) by their own account email, not arbitrary text -
 * so it's always a real, connected person on the team, not a typo. `files`
 * are whatever the sender picked in the composer's file input, attached
 * as-is. Creates a short follow-up task on the deal, assigned to the sender,
 * so a sent email doesn't just disappear into the void if the customer
 * never replies.
 */
export async function sendTemplatedEmailAction(
  dealId: string,
  subjectRaw: string,
  bodyHtmlRaw: string,
  ccUserIds: string[] = [],
  files: File[] = []
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();

  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  if (totalBytes > MAX_ATTACHMENTS_BYTES) {
    return { ok: false, error: "Vedhæftede filer fylder for meget samlet (maks. 25 MB) - Gmail afviser den." };
  }

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

  // Appended unless the composed text (hand-typed or from a saved template)
  // already has its own sign-off - a signature being there is meant to be a
  // guarantee, not something that depends on the sender remembering to type
  // {{sælger}} or a template author having included one, but a template
  // that already ends with "Med venlig hilsen ..." shouldn't get a second
  // one stacked under it. Format matches the normal Nextview360 sign-off
  // (bold name, "Nextview360", phone line) already used on visitor-stats
  // report emails.
  const alreadyHasSignature = /med venlig hilsen/i.test(body);
  const sellerName = [user.name, user.lastName].filter(Boolean).join(" ");
  const signatureLines = [sellerName, "Nextview360", user.phone ? `Tlf: ${user.phone}` : null].filter(
    (line): line is string => Boolean(line)
  );
  const signatureText = alreadyHasSignature ? "" : `\n\nMed venlig hilsen\n${signatureLines.join("\n")}`;
  const signatureHtml = alreadyHasSignature
    ? ""
    : `<p>Med venlig hilsen<br><b>${sellerName}</b>${signatureLines
        .slice(1)
        .map((line) => `<br>${line}`)
        .join("")}</p>`;

  const plainTextBody = looksLikeHtml(body) ? body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") : body;
  const plainText = `${plainTextBody.trim()}${signatureText}`;
  const bodyForHtml = looksLikeHtml(body) ? body : plainTextToHtml(body);

  const attachments = await Promise.all(
    files.map(async (f) => ({
      filename: f.name,
      contentType: f.type || "application/octet-stream",
      data: Buffer.from(await f.arrayBuffer()),
    }))
  );

  // A single shared email (one Gmail message, To+Cc headers) can't say whose
  // mail client loaded its pixel - every recipient sees the exact same
  // message. The only way to know specifically who opened it is to send the
  // primary contact and each Cc'ed colleague their OWN separate copy, each
  // with its own uniquely-tracked pixel. The trade-off: no copy's own
  // headers show the others anymore, so the full distribution list is
  // written into the body text instead, for every copy, so nobody loses
  // visibility into who else was included.
  const recipients = [
    { address: recipient, isPrimary: true },
    ...ccEmails.map((address) => ({ address, isPrimary: false })),
  ];
  const distributionLine =
    recipients.length > 1
      ? `Sendt til: ${recipient}${ccEmails.length > 0 ? ` · Cc: ${ccEmails.join(", ")}` : ""}`
      : null;

  const fromName = [user.name, user.lastName].filter(Boolean).join(" ");
  const recipientRows: { address: string; isPrimary: boolean; gmailMessageId: string; trackingId: string }[] = [];
  let primaryGmailMessageId: string | null = null;

  for (const r of recipients) {
    const recipientTrackingId = crypto.randomUUID();
    const recipientPixel = `<img src="${getAppBaseUrl()}/api/track/email-open/${recipientTrackingId}" width="1" height="1" style="display:none" alt="" />`;
    const recipientBodyHtml = `${bodyForHtml}${signatureHtml}${
      distributionLine ? `<p style="margin-top:12px;color:#94a3b8;font-size:11px;">${distributionLine}</p>` : ""
    }${recipientPixel}`;
    const recipientPlainText = `${plainText}${distributionLine ? `\n\n${distributionLine}` : ""}`;

    try {
      const sendResult = await sendGmailMessage(account, {
        to: [r.address],
        subject,
        bodyText: recipientPlainText,
        bodyHtml: recipientBodyHtml,
        attachments: attachments.length > 0 ? attachments : undefined,
        fromName,
      });
      recipientRows.push({ address: r.address, isPrimary: r.isPrimary, gmailMessageId: sendResult.id, trackingId: recipientTrackingId });
      if (r.isPrimary) primaryGmailMessageId = sendResult.id;
    } catch (err) {
      // The primary contact not receiving the mail is a real failure; a
      // Cc'ed colleague's copy failing to send isn't worth blocking on, since
      // the actual customer still got theirs.
      if (r.isPrimary) {
        return { ok: false, error: err instanceof Error ? err.message : "Kunne ikke sende e-mailen." };
      }
      console.error(`Kunne ikke sende Cc-kopi til ${r.address}`, err);
    }
  }

  if (!primaryGmailMessageId) {
    return { ok: false, error: "Kunne ikke sende e-mailen." };
  }

  const primaryTrackingId = recipientRows.find((r) => r.isPrimary)?.trackingId ?? null;

  const message = await prisma.emailMessage.create({
    data: {
      dealId,
      provider: "GOOGLE",
      messageId: primaryGmailMessageId,
      direction: "OUTBOUND",
      fromAddress: account.email,
      toAddresses: recipient,
      ccAddresses: ccEmails.length > 0 ? ccEmails.join(", ") : null,
      subject,
      bodyText: plainText,
      sentAt: new Date(),
      trackingId: primaryTrackingId,
    },
  });

  if (recipientRows.length > 0) {
    await prisma.emailRecipientOpen.createMany({
      data: recipientRows.map((r) => ({
        messageId: message.id,
        address: r.address,
        isPrimary: r.isPrimary,
        gmailMessageId: r.gmailMessageId,
        trackingId: r.trackingId,
      })),
    });
  }

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
