import { prisma } from "@/lib/db";
import { getValidAccessToken } from "@/lib/google-calendar";
import type { EmailAccount } from "@prisma/client";

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
/** How far back to look each run - generous overlap so a slow/late cron never misses a message. */
const LOOKBACK_DAYS = 3;

type GmailMessageMeta = {
  id: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
};

function extractEmailAddress(headerValue: string): string {
  const match = headerValue.match(/<([^>]+)>/);
  return (match ? match[1] : headerValue).trim().toLowerCase();
}

async function fetchRecentGmailMessages(account: EmailAccount): Promise<GmailMessageMeta[]> {
  const accessToken = await getValidAccessToken(account);
  const query = encodeURIComponent(`in:inbox newer_than:${LOOKBACK_DAYS}d`);

  const listRes = await fetch(`${GMAIL_API_BASE}/messages?q=${query}&maxResults=50`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!listRes.ok) throw new Error(`Gmail list fejlede (${listRes.status})`);
  const listData = await listRes.json();
  const ids: string[] = (listData.messages ?? []).map((m: { id: string }) => m.id);

  const headerParams = ["From", "To", "Subject", "Date"]
    .map((h) => `metadataHeaders=${h}`)
    .join("&");

  const messages: GmailMessageMeta[] = [];
  for (const id of ids) {
    const res = await fetch(`${GMAIL_API_BASE}/messages/${id}?format=metadata&${headerParams}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) continue;
    const data = await res.json();
    const headers: Record<string, string> = {};
    for (const h of data.payload?.headers ?? []) headers[h.name] = h.value;
    messages.push({
      id: data.id,
      from: headers["From"] ?? "",
      to: headers["To"] ?? "",
      subject: headers["Subject"] ?? "",
      date: headers["Date"] ?? "",
      snippet: data.snippet ?? "",
    });
  }
  return messages;
}

export type EmailSyncSummary = {
  accountsChecked: number;
  matched: number;
  created: number;
  errors: string[];
};

/**
 * Polls each connected Gmail account's inbox for recent mail and, when the
 * sender matches a deal's contact e-mail, stores it as an EmailMessage so
 * it shows up on that deal - the actual "add an e-mail to a deal, and mail
 * from it lands there automatically" behavior. Safe to re-run: already-
 * stored messages are skipped via the (provider, messageId) unique key.
 */
export async function syncInboundEmails(): Promise<EmailSyncSummary> {
  const accounts = await prisma.emailAccount.findMany({ where: { provider: "GOOGLE" } });

  const deals = await prisma.deal.findMany({
    where: { contactEmail: { not: null } },
    select: { id: true, contactEmail: true },
  });
  const dealIdByEmail = new Map<string, string>();
  for (const d of deals) {
    if (d.contactEmail) dealIdByEmail.set(d.contactEmail.toLowerCase(), d.id);
  }

  let matched = 0;
  let created = 0;
  const errors: string[] = [];

  for (const account of accounts) {
    let messages: GmailMessageMeta[];
    try {
      messages = await fetchRecentGmailMessages(account);
    } catch (err) {
      errors.push(`${account.email}: ${err instanceof Error ? err.message : "ukendt fejl"}`);
      continue;
    }

    for (const msg of messages) {
      const senderEmail = extractEmailAddress(msg.from);
      const dealId = dealIdByEmail.get(senderEmail);
      if (!dealId) continue;
      matched++;

      const existing = await prisma.emailMessage.findUnique({
        where: { provider_messageId: { provider: "GOOGLE", messageId: msg.id } },
      });
      if (existing) continue;

      const sentAt = new Date(msg.date);
      await prisma.emailMessage.create({
        data: {
          dealId,
          provider: "GOOGLE",
          messageId: msg.id,
          direction: "INBOUND",
          fromAddress: senderEmail,
          toAddresses: msg.to,
          subject: msg.subject || null,
          bodyText: msg.snippet || null,
          sentAt: isNaN(sentAt.getTime()) ? new Date() : sentAt,
        },
      });
      created++;
    }
  }

  return { accountsChecked: accounts.length, matched, created, errors };
}
