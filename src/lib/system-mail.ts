import "server-only";
import type { EmailAccount } from "@prisma/client";
import { sendGmailMessage } from "@/lib/gmail";

/*
 * The mails Arpo sends by itself (login links, the review mail, "rettelser
 * lavet", reports, the welcome mail, Betalingsservice, notes to the team) go
 * through Resend when RESEND_API_KEY is set in Vercel - from our own
 * addresses on nextview360.dk (the domain is verified at Resend), so they
 * don't pile up in someone's Gmail "Sendt". Answers still reach us: each
 * mail has a Reply-To (info@ or lasse@). Without the key - or if Resend
 * fails - it goes through the connected Gmail as before, so nothing is lost.
 * Mails written by a person (deal mails, sales mails) stay in Gmail.
 */

export const resendReady = () => Boolean(process.env.RESEND_API_KEY);

type MailParams = Parameters<typeof sendGmailMessage>[1];
const PLAIN_ADDRESS = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;

async function sendWithResend(params: MailParams & { fromAddress: string }): Promise<{ id: string }> {
  const from = params.fromName ? `${params.fromName.replace(/[<>"\r\n]/g, "")} <${params.fromAddress}>` : params.fromAddress;
  const replyTo = params.replyTo && PLAIN_ADDRESS.test(params.replyTo) ? params.replyTo : params.fromAddress;
  const attachments = [
    ...(params.attachments ?? []).map((a) => ({ filename: a.filename, content: a.data.toString("base64"), content_type: a.contentType })),
    ...(params.bodyHtml ? (params.inline ?? []) : []).map((i) => ({ filename: i.filename, content: i.data.toString("base64"), content_type: i.contentType, content_id: i.cid })),
  ];
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: params.to,
      ...(params.cc?.length ? { cc: params.cc } : {}),
      reply_to: replyTo,
      subject: params.subject,
      text: params.bodyText,
      ...(params.bodyHtml ? { html: params.bodyHtml } : {}),
      ...(attachments.length ? { attachments } : {}),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await res.json().catch(() => null)) as { id?: string; message?: string } | null;
  // Never the key - only Resend's own message.
  if (!res.ok || !body?.id) throw new Error(`Resend: kunne ikke sende mail (${res.status})${body?.message ? `: ${body.message}` : ""}`);
  return { id: body.id };
}

/**
 * Sends one of Arpo's own mails: through Resend when it's set up, else (or if
 * Resend fails) through `gmail` - a connected Gmail account, or a function
 * that finds one only when it's needed. `fromAddress` is the address the
 * customer sees (and answers to, unless `replyTo` says otherwise).
 */
export async function sendSystemMail(
  gmail: EmailAccount | null | (() => Promise<EmailAccount | null>),
  params: MailParams & { fromAddress: string },
): Promise<{ id: string; via: "resend" | "gmail" }> {
  let resendError: unknown = null;
  if (resendReady()) {
    try {
      return { ...(await sendWithResend(params)), via: "resend" };
    } catch (err) {
      resendError = err;
      console.error("[system-mail] Resend fejlede - prøver Gmail", err instanceof Error ? err.message : err);
    }
  }
  const account = typeof gmail === "function" ? await gmail() : gmail;
  if (!account) {
    if (resendError) throw resendError;
    throw new Error("Ingen mail-afsender: sæt RESEND_API_KEY i Vercel, eller forbind Gmail under Indstillinger → E-mail.");
  }
  // Gmail can only send as an address it has as "Send mail as" - its own otherwise.
  return { ...(await sendGmailMessage(account, { ...params, fromAddress: params.fromAddress === account.email ? undefined : params.fromAddress })), via: "gmail" };
}
