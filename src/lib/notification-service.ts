import { prisma } from "@/lib/db";
import { sendGmailMessage } from "@/lib/gmail";
import { getAppBaseUrl } from "@/lib/email-oauth";
import { dealName } from "@/lib/labels";
import { CONTRACT_SIGNER } from "@/lib/contract-template-data";

export type NotificationResult = { sent: boolean; reason?: string };

/**
 * Notifies the deal owner and all admins by email when a contract is
 * signed - sent as the shared info@nextview360.dk address (CONTRACT_SIGNER),
 * not whichever seller happens to own the deal. There's no dedicated Google
 * account for info@ - it's a "Send mail as" alias that runs through one of
 * the admins' own connected Gmail, so this tries each admin's connected
 * account in turn (sending via Gmail with that alias as the From address)
 * until one actually has it configured and the send succeeds. Sending used
 * to go through the owner's own connected Gmail specifically, which meant
 * nobody - not even the admins - heard about it at all if that particular
 * seller hadn't connected theirs; trying every admin's account doesn't have
 * that gap. Non-blocking - never throws, just reports why it couldn't send
 * if none of them could.
 */
export async function sendContractSignedNotification(dealId: string): Promise<NotificationResult> {
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, include: { owner: true } });
  if (!deal) return { sent: false, reason: "Deal ikke fundet." };

  const admins = await prisma.user.findMany({ where: { role: "ADMIN" } });
  const adminAccounts = await prisma.emailAccount.findMany({
    where: { userId: { in: admins.map((a) => a.id) }, provider: "GOOGLE" },
  });
  if (adminAccounts.length === 0) {
    return { sent: false, reason: "Ingen admin har forbundet Google under Indstillinger → E-mail." };
  }

  const recipients = Array.from(new Set([deal.owner.email, ...admins.map((a) => a.email)]));
  const dealUrl = `${getAppBaseUrl()}/deals/${deal.id}`;

  let lastError = "Ukendt fejl ved afsendelse.";
  for (const account of adminAccounts) {
    try {
      await sendGmailMessage(account, {
        to: recipients,
        subject: `Kontrakt underskrevet: ${dealName(deal)}`,
        bodyText: `${dealName(deal)} har lige underskrevet kontrakt.\n\nSe dealen: ${dealUrl}`,
        fromName: "Nextview360",
        fromAddress: CONTRACT_SIGNER.email,
      });
      return { sent: true };
    } catch (err) {
      lastError = err instanceof Error ? err.message : lastError;
    }
  }
  return { sent: false, reason: lastError };
}
