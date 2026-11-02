"use server";

import { requireUser } from "@/lib/auth";
import { sendDealEmail } from "@/lib/deal-email-send";

/** The deal page's send: as the person asking, from their own Gmail (see sendDealEmail). */
export async function sendTemplatedEmailAction(
  dealId: string,
  subjectRaw: string,
  bodyHtmlRaw: string,
  ccUserIds: string[] = [],
  files: File[] = []
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  return sendDealEmail(user, dealId, subjectRaw, bodyHtmlRaw, ccUserIds, files);
}
