import { getValidAccessToken } from "@/lib/google-calendar";
import type { EmailAccount } from "@prisma/client";

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function encodeHeaderUtf8(value: string): string {
  return `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
}

export async function sendGmailMessage(
  account: EmailAccount,
  params: {
    to: string[];
    cc?: string[];
    subject: string;
    bodyText: string;
    /** Renders as the body instead of bodyText when set, for simple formatting (e.g. a bold signature name). */
    bodyHtml?: string;
    /** One or more files attached to the email - e.g. a generated report PDF,
     * or whatever the sender picked in the composer's file picker. */
    attachments?: { filename: string; contentType: string; data: Buffer }[];
    /** Pictures shown in bodyHtml itself, as <img src="cid:<cid>"> - sent with the mail, nothing to fetch from a server. */
    inline?: { cid: string; filename: string; contentType: string; data: Buffer }[];
    /** Shown as the sender's display name (e.g. "Nextview360 ApS") instead of the raw account email. */
    fromName?: string;
    /** Sends as a different address than the connected account's own e-mail
     * - only works if that address is already set up as a verified "Send
     * mail as" alias on this Gmail account (Gmail silently rejects/rewrites
     * it otherwise), e.g. sending as the shared info@nextview360.dk through
     * whichever admin's personal Google account has that alias configured. */
    fromAddress?: string;
    /** Where an answer goes (e.g. the visitor who wrote with a tour's contact form). Must be a plain address. */
    replyTo?: string;
  }
): Promise<{ id: string }> {
  const accessToken = await getValidAccessToken(account);

  const bodyContentType = params.bodyHtml ? "text/html" : "text/plain";
  const body = params.bodyHtml ?? params.bodyText;
  const fromAddress = params.fromAddress ?? account.email;
  const from = params.fromName ? `${encodeHeaderUtf8(params.fromName)} <${fromAddress}>` : fromAddress;
  const headerLines = [
    `From: ${from}`,
    `To: ${params.to.join(", ")}`,
    ...(params.cc && params.cc.length > 0 ? [`Cc: ${params.cc.join(", ")}`] : []),
    // Only a plain address - never anything that could add a header line.
    ...(params.replyTo && /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/.test(params.replyTo) ? [`Reply-To: ${params.replyTo}`] : []),
    `Subject: ${encodeHeaderUtf8(params.subject)}`,
  ];

  const b64 = (data: Buffer) => data.toString("base64").replace(/(.{76})/g, "$1\r\n");
  // The HTML with its own pictures (multipart/related), when it has any.
  const inline = params.bodyHtml ? (params.inline ?? []).filter((i) => /^[\w.-]+$/.test(i.cid) && /^[\w.-]+$/.test(i.filename)) : [];
  const relatedBoundary = `nv360r_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const bodyPart = inline.length
    ? [
        `Content-Type: multipart/related; boundary="${relatedBoundary}"`,
        "",
        `--${relatedBoundary}`,
        `Content-Type: text/html; charset="UTF-8"`,
        "",
        body,
        "",
        ...inline.flatMap((i) => [`--${relatedBoundary}`, `Content-Type: ${i.contentType}; name="${i.filename}"`, `Content-Disposition: inline; filename="${i.filename}"`, `Content-ID: <${i.cid}>`, `Content-Transfer-Encoding: base64`, "", b64(i.data), ""]),
        `--${relatedBoundary}--`,
      ]
    : [`Content-Type: ${bodyContentType}; charset="UTF-8"`, "", body];

  let mime: string;
  if (params.attachments && params.attachments.length > 0) {
    const boundary = `nv360_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    // Gmail's raw message is a single flat string, so each binary attachment
    // has to be inlined as base64 text within the multipart body - wrapped
    // at 76 chars/line per the MIME spec, not because Gmail requires it
    // strictly. One part per attachment, all sharing the same boundary.
    const attachmentParts = params.attachments.flatMap((a) => {
      const dataB64 = a.data.toString("base64").replace(/(.{76})/g, "$1\r\n");
      return [
        `--${boundary}`,
        `Content-Type: ${a.contentType}; name="${a.filename}"`,
        `Content-Disposition: attachment; filename="${a.filename}"`,
        `Content-Transfer-Encoding: base64`,
        "",
        dataB64,
        "",
      ];
    });
    mime = [
      ...headerLines,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      ...bodyPart,
      "",
      ...attachmentParts,
      `--${boundary}--`,
    ].join("\r\n");
  } else {
    mime = [...headerLines, ...(inline.length ? ["MIME-Version: 1.0"] : []), ...bodyPart].join("\r\n");
  }

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: base64UrlEncode(mime) }),
  });

  if (!res.ok) {
    throw new Error(`Gmail: kunne ikke sende mail (${res.status}): ${await res.text()}`);
  }

  const result: { id: string } = await res.json();
  return { id: result.id };
}

/*
 * The sender's own Gmail signature (Gmail → Indstillinger → Signatur), as Gmail
 * keeps it - Gmail only adds it to mails written in Gmail itself, not to mails
 * sent through its API, so Arpo puts it in. Read with the access Arpo already
 * has (gmail.readonly); kept 10 minutes per account. null: none set (or Gmail
 * didn't answer) - Arpo's own short sign-off is used then.
 */
const signatures = new Map<string, { at: number; html: string | null }>();

export async function gmailSignature(account: EmailAccount): Promise<string | null> {
  const hit = signatures.get(account.id);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.html;
  let html: string | null = null;
  try {
    const token = await getValidAccessToken(account);
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs", { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = (await res.json()) as { sendAs?: { sendAsEmail?: string; isDefault?: boolean; isPrimary?: boolean; signature?: string }[] };
      const list = data.sendAs ?? [];
      const own = list.find((s) => s.sendAsEmail?.toLowerCase() === account.email.toLowerCase()) ?? list.find((s) => s.isDefault) ?? list.find((s) => s.isPrimary);
      html = own?.signature?.trim() || null;
    }
  } catch {
    html = null;
  }
  if (signatures.size > 100) signatures.clear();
  signatures.set(account.id, { at: Date.now(), html });
  return html;
}

/** A Gmail signature as plain lines (for the text version of a mail and the generator's preview). */
export function signatureLines(html: string): string[] {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|tr|li|h\d|table)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** The sign-off for a mail from Arpo: the sender's Gmail signature when they have one (with "Med venlig hilsen" above it, unless it says so itself), else `fallback`. */
export async function mailSignOff(account: EmailAccount, fallback: { html: string; text: string }): Promise<{ html: string; text: string }> {
  const sig = await gmailSignature(account);
  if (!sig) return fallback;
  const greet = /hilsen|regards/i.test(sig) ? "" : "Med venlig hilsen";
  return {
    html: `${greet ? `<p>${greet}</p>` : ""}<div>${sig}</div>`,
    text: `\n\n${[greet, ...signatureLines(sig)].filter(Boolean).join("\n")}`,
  };
}
