import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { getAppBaseUrl } from "@/lib/email-oauth";
import { sendGmailMessage } from "@/lib/gmail";
import { WELCOME_MAIL_SENDER } from "@/lib/welcome-mail";

/*
 * Customers log in without a password: they write their e-mail and get a
 * link. The link works once, for 15 minutes, and only its hash is stored -
 * a copy of the database can't be used to log in. Only e-mails we have given
 * access in Arpo get a link; everyone else gets the same answer, so nobody
 * can find out who is a customer.
 */

const LINK_MINUTES = 15;
/** The first link, when access is given in Arpo: the customer may not open the mail the same day. */
const WELCOME_DAYS = 7;
/** Links one customer can ask for in an hour, and requests from one address in 15 minutes. */
const MAX_PER_ACCOUNT_HOUR = 5;
const MAX_PER_IP = 20;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** A fresh one-time link for the account - the token itself only ever exists in the e-mail. */
async function newLink(accountId: string, minutes: number): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.customerLoginToken.create({ data: { tokenHash: hash(token), accountId, expiresAt: new Date(Date.now() + minutes * 60_000) } });
  // Used and expired links are no use - cleared as we go, so the table stays small.
  await prisma.customerLoginToken.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 24 * 3600_000) } } });
  return `${getAppBaseUrl()}/login/link?t=${token}`;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Sends the login mail from lasse@nextview360.dk. `welcome` = the first one, when access is given in Arpo. */
export async function sendLoginMail(account: { id: string; email: string; name: string | null }, welcome = false): Promise<void> {
  const link = await newLink(account.id, welcome ? WELCOME_DAYS * 24 * 60 : LINK_MINUTES);
  const hi = account.name ? `Hej ${account.name.split(" ")[0]}` : "Hej";
  const subject = welcome ? "Jeres egen side hos Nextview360" : "Dit login til Nextview360";
  const lead = welcome
    ? "I har nu jeres egen side hos Nextview360. Her kan I se, hvordan jeres virtuelle tour klarer sig, hente koderne til jeres hjemmeside og finde jeres kontrakt."
    : "Her er dit link til at logge ind hos Nextview360.";
  const after = welcome
    ? `Linket virker én gang i de næste ${WELCOME_DAYS} dage. Næste gang skriver I bare jeres e-mail på nextview360.dk/login, så får I et nyt link.`
    : `Linket virker én gang og i ${LINK_MINUTES} minutter. Har du ikke bedt om det, kan du se bort fra mailen.`;
  const bodyText = `${hi}\n\n${lead}\n\nLog ind her:\n${link}\n\n${after}\n\nVenlig hilsen\nNextview360`;
  const bodyHtml = `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1d1d1f;max-width:520px">
<p>${esc(hi)}</p>
<p>${esc(lead)}</p>
<p><a href="${esc(link)}" style="display:inline-block;background:#0071e3;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:12px">Log ind</a></p>
<p style="color:#6e6e73;font-size:13px">${esc(after)}</p>
<p>Venlig hilsen<br>Nextview360</p>
</div>`;

  const sender = await prisma.emailAccount.findFirst({ where: { provider: "GOOGLE", email: WELCOME_MAIL_SENDER } });
  if (!sender) {
    // On a developer's machine there's no Gmail to send from - the link goes to the server log instead.
    if (process.env.NODE_ENV !== "production") {
      console.log(`[kundelogin] Link til ${account.email}: ${link}`);
      return;
    }
    throw new Error(`Ingen forbundet Gmail-konto for ${WELCOME_MAIL_SENDER}. Forbind den under Indstillinger → E-mail.`);
  }
  await sendGmailMessage(sender, { to: [account.email], subject, bodyText, bodyHtml, fromName: "Nextview360" });
}

/**
 * "Send mig et link" on the login page. Always the same outcome to the
 * visitor; a link only goes out to a known customer, a few times an hour.
 */
export async function requestLoginLink(emailRaw: string, ip: string): Promise<void> {
  const email = normalizeEmail(emailRaw);
  if (!email.includes("@") || email.length > 200) return;
  const since = new Date(Date.now() - 15 * 60_000);
  // Requests per address share the password login's guard table.
  if ((await prisma.loginFailure.count({ where: { ip, createdAt: { gte: since } } })) >= MAX_PER_IP) return;
  await prisma.loginFailure.create({ data: { email: `link:${email}`, ip } });

  const account = await prisma.customerAccount.findUnique({ where: { email } });
  if (!account) return;
  const recent = await prisma.customerLoginToken.count({ where: { accountId: account.id, createdAt: { gte: new Date(Date.now() - 3600_000) } } });
  if (recent >= MAX_PER_ACCOUNT_HOUR) return;
  await sendLoginMail(account).catch((err) => console.error("Kunne ikke sende login-link", err));
}

/** The link from the e-mail, used: the account it belongs to, or null if it's unknown, used or too old. */
export async function consumeLoginLink(token: string): Promise<string | null> {
  if (!token || token.length > 100) return null;
  const row = await prisma.customerLoginToken.findUnique({ where: { tokenHash: hash(token) }, select: { id: true, accountId: true } });
  if (!row) return null;
  // Marked used in the same step as it's checked - two clicks at once can't both log in.
  const used = await prisma.customerLoginToken.updateMany({ where: { id: row.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
  if (used.count !== 1) return null;
  await prisma.customerAccount.update({ where: { id: row.accountId }, data: { lastLoginAt: new Date() } });
  return row.accountId;
}
