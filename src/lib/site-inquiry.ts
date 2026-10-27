import "server-only";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { buildDealEmailAddress } from "@/lib/email-address";
import { sendGmailMessage } from "@/lib/gmail";
import { getAppBaseUrl } from "@/lib/email-oauth";
import { CONTRACT_SIGNER } from "@/lib/contract-template-data";

/*
 * The contact form on nextview360.dk: every message becomes a lead in
 * Leadindbakken (owned by the first admin), with the message as a note, and
 * the admins get an e-mail. The message itself is always kept (SiteInquiry),
 * even if making the lead or the e-mail fails.
 */

export type Inquiry = { name: string; company?: string; email: string; phone?: string; interest?: string; message?: string; page?: string };

const MAX_PER_HOUR = 5;

export async function receiveInquiry(input: Inquiry, ip: string): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const since = new Date(Date.now() - 3600_000);
  if ((await prisma.siteInquiry.count({ where: { ip, createdAt: { gte: since } } })) >= MAX_PER_HOUR) {
    return { ok: false, status: 429, error: "Du har sendt flere beskeder lige nu - ring gerne på +45 20 91 02 94." };
  }
  const inquiry = await prisma.siteInquiry.create({ data: { ...input, ip } });

  const owner = await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } });
  if (!owner) return { ok: true }; // kept in SiteInquiry - nobody to give the lead to yet
  const body = [
    "Henvendelse fra kontaktformularen på nextview360.dk",
    input.interest && `Interesseret i: ${input.interest}`,
    input.message && `\n${input.message}`,
    input.page && `\nSendt fra: ${input.page}`,
  ]
    .filter(Boolean)
    .join("\n");
  const deal = await prisma.deal.create({
    data: {
      companyName: input.company || input.name,
      contactName: input.name,
      contactEmail: input.email,
      contactPhone: input.phone || null,
      ownerId: owner.id,
      importType: "MANUAL",
      inLeadInbox: true,
      notes: { create: { authorId: owner.id, body } },
    },
  });
  await prisma.deal.update({ where: { id: deal.id }, data: { dealEmailAddress: buildDealEmailAddress(deal.id) } });
  await prisma.siteInquiry.update({ where: { id: inquiry.id }, data: { dealId: deal.id } });
  await logActivity({ type: "DEAL_CREATED", message: `Ny henvendelse fra hjemmesiden: ${input.company || input.name}`, dealId: deal.id });
  await notifyAdmins(deal.id, input).catch(() => {});
  return { ok: true };
}

/** An e-mail to the admins, sent as info@ through an admin's connected Gmail (as for signed contracts). */
async function notifyAdmins(dealId: string, input: Inquiry) {
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" } });
  const accounts = await prisma.emailAccount.findMany({ where: { userId: { in: admins.map((a) => a.id) }, provider: "GOOGLE" } });
  const lines = [
    `${input.name}${input.company ? `, ${input.company}` : ""} har skrevet via nextview360.dk.`,
    "",
    `E-mail: ${input.email}`,
    input.phone && `Telefon: ${input.phone}`,
    input.interest && `Interesseret i: ${input.interest}`,
    input.message && `\n${input.message}`,
    "",
    `Se leadet i Arpo: ${getAppBaseUrl()}/arpo/deals/${dealId}`,
  ].filter((l): l is string => typeof l === "string");
  for (const account of accounts) {
    try {
      await sendGmailMessage(account, {
        to: admins.map((a) => a.email),
        subject: `Ny henvendelse fra hjemmesiden: ${input.company || input.name}`,
        bodyText: lines.join("\n"),
        fromName: "Nextview360",
        fromAddress: CONTRACT_SIGNER.email,
      });
      return;
    } catch {
      // the next admin's account may have the info@ alias set up
    }
  }
}
