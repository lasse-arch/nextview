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
    attachment?: { filename: string; contentType: string; data: Buffer };
  }
): Promise<void> {
  const accessToken = await getValidAccessToken(account);

  const bodyContentType = params.bodyHtml ? "text/html" : "text/plain";
  const body = params.bodyHtml ?? params.bodyText;
  const headerLines = [
    `From: ${account.email}`,
    `To: ${params.to.join(", ")}`,
    ...(params.cc && params.cc.length > 0 ? [`Cc: ${params.cc.join(", ")}`] : []),
    `Subject: ${encodeHeaderUtf8(params.subject)}`,
  ];

  let mime: string;
  if (params.attachment) {
    const boundary = `nv360_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    // Gmail's raw message is a single flat string, so a binary attachment has
    // to be inlined as base64 text within the multipart body - wrapped at 76
    // chars/line per the MIME spec, not because Gmail requires it strictly.
    const attachmentB64 = params.attachment.data.toString("base64").replace(/(.{76})/g, "$1\r\n");
    mime = [
      ...headerLines,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      `Content-Type: ${bodyContentType}; charset="UTF-8"`,
      "",
      body,
      "",
      `--${boundary}`,
      `Content-Type: ${params.attachment.contentType}; name="${params.attachment.filename}"`,
      `Content-Disposition: attachment; filename="${params.attachment.filename}"`,
      `Content-Transfer-Encoding: base64`,
      "",
      attachmentB64,
      "",
      `--${boundary}--`,
    ].join("\r\n");
  } else {
    mime = [...headerLines, `Content-Type: ${bodyContentType}; charset="UTF-8"`, "", body].join("\r\n");
  }

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: base64UrlEncode(mime) }),
  });

  if (!res.ok) {
    throw new Error(`Gmail: kunne ikke sende mail (${res.status}): ${await res.text()}`);
  }
}
