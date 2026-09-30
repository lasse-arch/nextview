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
  body: string;
};

type GmailMessagePart = {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailMessagePart[];
};

function extractEmailAddress(headerValue: string): string {
  const match = headerValue.match(/<([^>]+)>/);
  return (match ? match[1] : headerValue).trim().toLowerCase();
}

/** A "To"/"Cc" header can list several recipients ("Navn <a@b.dk>, c@d.dk") -
 * splits on comma and extracts each one, unlike extractEmailAddress which
 * only handles the single-address "From" header. */
function extractEmailAddresses(headerValue: string): string[] {
  return headerValue
    .split(",")
    .map((part) => extractEmailAddress(part))
    .filter(Boolean);
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

/** Depth-first search for the first part of the given MIME type - Gmail nests
 * the real content under `payload.parts` for anything but the simplest plain-
 * text-only messages (multipart/alternative, multipart/mixed with attachments, ...). */
function findMimePart(part: GmailMessagePart, mimeType: string): string | null {
  if (part.mimeType === mimeType && part.body?.data) return decodeBase64Url(part.body.data);
  for (const child of part.parts ?? []) {
    const found = findMimePart(child, mimeType);
    if (found) return found;
  }
  return null;
}

/** Named HTML entities worth decoding here - beyond the universal amp/lt/gt/
 * quot/apos/nbsp, this is specifically the Danish letters (æ/ø/å in both
 * cases), since some mail clients still encode a Danish HTML body with named
 * entities instead of raw UTF-8, and a note or e-mail full of "&aelig;" where
 * "æ" belongs reads far worse than any layout issue. Numeric entities
 * (&#248; / &#xF8;) are handled generically below, not via this table. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  aelig: "æ",
  Aelig: "Æ",
  oslash: "ø",
  Oslash: "Ø",
  aring: "å",
  Aring: "Å",
};

function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1] === "x" || entity[1] === "X" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[entity] ?? match;
  });
}

/** Turns the (much more common) text/html body into readable plain text -
 * converting block-level tags to line breaks first, unlike a plain "strip all
 * tags" pass, so paragraphs and signature lines don't all run together on one line. */
function htmlToReadableText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<(br|br\/)\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Prefers the real text/plain part (already has proper line breaks); falls
 * back to converting text/html when a message has no plain-text alternative -
 * common for anything composed in Outlook/Gmail's rich-text editor. */
function extractReadableBody(payload: GmailMessagePart): string | null {
  const plain = findMimePart(payload, "text/plain");
  if (plain) return plain.trim();
  const html = findMimePart(payload, "text/html");
  return html ? htmlToReadableText(html) : null;
}

async function fetchRecentGmailMessages(account: EmailAccount, gmailQuery: string): Promise<GmailMessageMeta[]> {
  const accessToken = await getValidAccessToken(account);
  const query = encodeURIComponent(`${gmailQuery} newer_than:${LOOKBACK_DAYS}d`);

  const listRes = await fetch(`${GMAIL_API_BASE}/messages?q=${query}&maxResults=50`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!listRes.ok) throw new Error(`Gmail list fejlede (${listRes.status})`);
  const listData = await listRes.json();
  const ids: string[] = (listData.messages ?? []).map((m: { id: string }) => m.id);

  const messages: GmailMessageMeta[] = [];
  for (const id of ids) {
    // format=full (not metadata) - the actual message body only comes down
    // this way; metadata-only responses have just a short auto-generated
    // "snippet" with no real line breaks, which is why the note/e-mail body
    // used to render as one long run-on sentence.
    const res = await fetch(`${GMAIL_API_BASE}/messages/${id}?format=full`, {
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
      body: (data.payload ? extractReadableBody(data.payload) : null) ?? data.snippet ?? "",
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
 * Polls each connected Gmail account's inbox AND sent folder for recent
 * mail, and when it matches a deal's contact e-mail, stores it as an
 * EmailMessage so it shows up on that deal - the actual "add an e-mail to a
 * deal, and mail to/from it lands there automatically" behavior. Inbound
 * mail matches by sender; outbound (sent) mail matches by recipient (to or
 * cc) - this is what picks up a reply a colleague sent straight from their
 * own Gmail rather than through the CRM's own "Send e-mail" button (which
 * already records its own EmailMessage directly at send time - the same
 * Gmail message turning up again here just gets skipped as a duplicate via
 * the (provider, messageId) unique key, same as any other already-stored
 * message on a re-run).
 */
export async function syncDealEmails(): Promise<EmailSyncSummary> {
  const accounts = await prisma.emailAccount.findMany({ where: { provider: "GOOGLE" } });

  const deals = await prisma.deal.findMany({
    where: { contactEmail: { not: null } },
    select: { id: true, contactEmail: true },
  });
  const dealIdByEmail = new Map<string, string>();
  for (const d of deals) {
    if (d.contactEmail) dealIdByEmail.set(d.contactEmail.trim().toLowerCase(), d.id);
  }

  let matched = 0;
  let created = 0;
  const errors: string[] = [];

  for (const account of accounts) {
    let inbox: GmailMessageMeta[];
    let sent: GmailMessageMeta[];
    try {
      [inbox, sent] = await Promise.all([
        fetchRecentGmailMessages(account, "in:inbox"),
        fetchRecentGmailMessages(account, "in:sent"),
      ]);
    } catch (err) {
      errors.push(`${account.email}: ${err instanceof Error ? err.message : "ukendt fejl"}`);
      continue;
    }

    for (const msg of inbox) {
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
          bodyText: msg.body || null,
          sentAt: isNaN(sentAt.getTime()) ? new Date() : sentAt,
        },
      });
      created++;
    }

    for (const msg of sent) {
      const recipientEmails = [...extractEmailAddresses(msg.to)];
      const dealId = recipientEmails.map((e) => dealIdByEmail.get(e)).find(Boolean);
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
          direction: "OUTBOUND",
          fromAddress: extractEmailAddress(msg.from),
          toAddresses: msg.to,
          subject: msg.subject || null,
          bodyText: msg.body || null,
          sentAt: isNaN(sentAt.getTime()) ? new Date() : sentAt,
        },
      });
      created++;
    }
  }

  return { accountsChecked: accounts.length, matched, created, errors };
}
