import { prisma } from "@/lib/db";
import { sendGmailMessage } from "@/lib/gmail";
import { getAppBaseUrl } from "@/lib/email-oauth";
import { dealName } from "@/lib/labels";
import { CONTRACT_SIGNER } from "@/lib/contract-template-data";

export type NotificationResult = { sent: boolean; reason?: string };

/**
 * Notifies the deal owner and all admins by email when a contract is
 * signed - always sent via the shared info@nextview360.dk mailbox
 * (CONTRACT_SIGNER's own address, already connected for sending contracts),
 * not whichever seller happens to own the deal. Sending used to go through
 * the owner's own connected Gmail, which meant nobody - not even the
 * admins - heard about it at all if that particular seller hadn't
 * connected theirs; a shared, always-on mailbox doesn't have that gap, so
 * Victor and Lasse (both admins) reliably get this every time. Non-blocking -
 * never throws, just reports why it couldn't send if it couldn't.
 */
export async function sendContractSignedNotification(dealId: string): Promise<NotificationResult> {
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, include: { owner: true } });
  if (!deal) return { sent: false, reason: "Deal ikke fundet." };

  const senderAccount = await prisma.emailAccount.findFirst({
    where: { email: CONTRACT_SIGNER.email, provider: "GOOGLE" },
  });
  if (!senderAccount) {
    return { sent: false, reason: `${CONTRACT_SIGNER.email} er ikke forbundet under Indstillinger → E-mail.` };
  }

  const admins = await prisma.user.findMany({ where: { role: "ADMIN" } });
  const recipients = Array.from(new Set([deal.owner.email, ...admins.map((a) => a.email)]));

  const dealUrl = `${getAppBaseUrl()}/deals/${deal.id}`;

  try {
    await sendGmailMessage(senderAccount, {
      to: recipients,
      subject: `Kontrakt underskrevet: ${dealName(deal)}`,
      bodyText: `${dealName(deal)} har lige underskrevet kontrakt.\n\nSe dealen: ${dealUrl}`,
      fromName: "Nextview360",
    });
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "Ukendt fejl ved afsendelse." };
  }
}
