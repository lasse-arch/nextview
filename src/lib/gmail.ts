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
