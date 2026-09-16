import { prisma } from "@/lib/db";
import { sendGmailMessage } from "@/lib/gmail";
import { getAppBaseUrl } from "@/lib/email-oauth";
import { dealName } from "@/lib/labels";

export type NotificationResult = { sent: boolean; reason?: string };

/**
 * Notifies the deal owner and all admins by email when a contract is
 * signed, sent via the owner's connected Gmail account. Non-blocking -
 * never throws, just reports why it couldn't send if it couldn't.
 */
export async function sendContractSignedNotification(dealId: string): Promise<NotificationResult> {
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, include: { owner: true } });
  if (!deal) return { sent: false, reason: "Deal ikke fundet." };

  const ownerAccount = await prisma.emailAccount.findUnique({
    where: { userId_provider: { userId: deal.ownerId, provider: "GOOGLE" } },
  });
  if (!ownerAccount) {
    return { sent: false, reason: `${deal.owner.name} har ikke forbundet Google under Indstillinger → E-mail.` };
  }

  const admins = await prisma.user.findMany({ where: { role: "ADMIN" } });
  const recipients = Array.from(new Set([deal.owner.email, ...admins.map((a) => a.email)]));

  const dealUrl = `${getAppBaseUrl()}/deals/${deal.id}`;

  try {
    await sendGmailMessage(ownerAccount, {
      to: recipients,
      subject: `Kontrakt underskrevet: ${dealName(deal)}`,
      bodyText: `${dealName(deal)} har lige underskrevet kontrakt.\n\nSe dealen: ${dealUrl}`,
    });
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "Ukendt fejl ved afsendelse." };
  }
}
