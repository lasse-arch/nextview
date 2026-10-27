import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { sendGmailMessage } from "@/lib/gmail";
import { getAppBaseUrl } from "@/lib/email-oauth";
import { dealName } from "@/lib/labels";
import { logActivity } from "@/lib/activity";
import { normalizeEmail, welcomeLoginLink, WELCOME_DAYS } from "@/lib/customer-login";
import { PHONE, WELCOME_MAIL_SENDER } from "@/lib/welcome-mail";
import { parseContractProducts } from "@/lib/contract-template-data";
import { notifyTeam } from "@/lib/notification-service";

/*
 * "Send til gennemgang": the customer gets a mail with the tour in its review
 * mode (/p/<token>) - they walk around, leave corrections right where they
 * stand ("Giv feedback"), and press "Godkend touren" when they're happy (in
 * the tour or on their customer page). We can send reminders, and approve it
 * ourselves when we don't hear back. Approving tells the team.
 */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function buildReviewMail(input: {
  contactName: string | null;
  customerName: string;
  reviewLink: string;
  portal: { link: string; days: number } | null;
  reminder: boolean;
  language: "da" | "en";
}): { subject: string; bodyText: string; bodyHtml: string } {
  const first = input.contactName?.trim().split(/\s+/)[0] || null;
  const t =
    input.language === "en"
      ? {
          subject: input.reminder ? `Reminder: your virtual tour is waiting for your feedback - ${input.customerName}` : `Your virtual tour is ready for review - ${input.customerName}`,
          greeting: `Hi ${first ?? "there"},`,
          intro: input.reminder
            ? "A friendly reminder: your virtual tour is still waiting for you to have a look - we would love to hear what you think before it goes live."
            : "Your virtual tour is ready, and we would love to hear what you think before it goes live.",
          button: "See the tour and give feedback",
          howTitle: "How it works:",
          how: ["Walk around the tour as a visitor would.", "See something that should be changed? Stand at the spot, press \"Give feedback\" and write what you'd like - we see exactly where.", "Happy with it? Press \"Approve the tour\"."],
          portal: "You can also see the tour and your corrections on your own customer page:",
          portalButton: "Go to your customer page",
          portalAfter: (d: number) => `The button works once in the next ${d} days.`,
          otherwise: "If we don't hear from you within a week, we will approve the tour ourselves.",
          contact: `Questions? Write to ${WELCOME_MAIL_SENDER} or call ${PHONE}.`,
          bye: "Kind regards",
        }
      : {
          subject: input.reminder ? `Påmindelse: Jeres virtuelle tour venter på jeres feedback - ${input.customerName}` : `Jeres virtuelle tour er klar til gennemsyn - ${input.customerName}`,
          greeting: `Hej ${first ?? "der"},`,
          intro: input.reminder
            ? "En venlig påmindelse: Jeres virtuelle tour venter stadig på, at I kigger på den - vi vil meget gerne høre, hvad I synes, før den går live."
            : "Jeres virtuelle tour er klar, og vi vil meget gerne høre, hvad I synes, før den går live.",
          button: "Se touren og giv feedback",
          howTitle: "Sådan gør I:",
          how: ["Gå rundt i touren, som en besøgende ville gøre.", "Ser I noget, der skal rettes? Stil jer det rigtige sted, tryk \"Giv feedback\" og skriv, hvad I gerne vil have ændret - vi kan se præcis hvor.", "Er I tilfredse? Tryk \"Godkend touren\"."],
          portal: "I kan også se touren og jeres rettelser på jeres egen kundeside:",
          portalButton: "Gå til jeres kundeside",
          portalAfter: (d: number) => `Knappen virker én gang i de næste ${d} dage.`,
          otherwise: "Hører vi ikke fra jer inden for en uge, godkender vi touren selv.",
          contact: `Spørgsmål? Skriv til ${WELCOME_MAIL_SENDER} eller ring på ${PHONE}.`,
          bye: "Med venlig hilsen",
        };
  const bodyText = [
    t.greeting,
    "",
    t.intro,
    "",
    `${t.button}: ${input.reviewLink}`,
    "",
    t.howTitle,
    ...t.how.map((h, i) => `${i + 1}. ${h}`),
    ...(input.portal ? ["", t.portal, `${t.portalButton}: ${input.portal.link}`, t.portalAfter(input.portal.days)] : []),
    "",
    t.otherwise,
    t.contact,
    "",
    t.bye,
    "Lasse",
    "Nextview360",
  ].join("\n");
  const pill = (href: string, text: string, primary: boolean) =>
    `<a href="${esc(href)}" style="display:inline-block;padding:11px 20px;border-radius:999px;text-decoration:none;font-weight:bold;${primary ? "background:#0f2a3d;color:#ffffff" : "background:#eef2f5;color:#0f2a3d"}">${esc(text)}</a>`;
  const bodyHtml = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1e293b;max-width:560px">
<p>${esc(t.greeting)}</p>
<p>${esc(t.intro)}</p>
<p style="margin:20px 0">${pill(input.reviewLink, t.button, true)}</p>
<p style="margin-bottom:4px"><b>${esc(t.howTitle)}</b></p>
<ol style="margin-top:0;padding-left:20px">${t.how.map((h) => `<li style="margin-bottom:4px">${esc(h)}</li>`).join("")}</ol>
${input.portal ? `<p style="margin-top:20px">${esc(t.portal)}</p><p>${pill(input.portal.link, t.portalButton, false)}</p><p style="font-size:12px;color:#64748b">${esc(t.portalAfter(input.portal.days))}</p>` : ""}
<p style="margin-top:20px">${esc(t.otherwise)}<br>${esc(t.contact)}</p>
<p>${esc(t.bye)}<br>Lasse<br>Nextview360</p>
</div>`;
  return { subject: t.subject, bodyText, bodyHtml };
}

/** Sends the review mail (or a reminder) to the customer's contact e-mail. Turns the review link on if it's off. */
export async function sendReviewMail(slug: string, actor: { id: string; name: string }, reminder: boolean): Promise<{ to: string; token: string }> {
  const tour = await prisma.tour.findUnique({
    where: { slug },
    select: { slug: true, reviewToken: true, reviewApprovedAt: true, deal: { select: { id: true, companyName: true, displayName: true, contactName: true, contactEmail: true, contractProducts: true } } },
  });
  const deal = tour?.deal;
  if (!tour || !deal) throw new Error("Touren er ikke koblet til en kunde i Arpo.");
  if (!deal.contactEmail) throw new Error("Kunden har ingen kontakt-e-mail på dealen - tilføj den først.");
  const to = normalizeEmail(deal.contactEmail);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error(`Kontakt-e-mailen på dealen ser forkert ud (${deal.contactEmail}).`);
  const token = tour.reviewToken ?? randomBytes(12).toString("base64url");
  // Their customer page only when this e-mail already has access to the deal - the mail never gives access by itself.
  const access = await prisma.customerAccountDeal.findFirst({ where: { dealId: deal.id, account: { email: to } }, select: { accountId: true } });
  const portal = access ? { link: await welcomeLoginLink(access.accountId), days: WELCOME_DAYS } : null;
  const mail = buildReviewMail({
    contactName: deal.contactName,
    customerName: dealName(deal),
    reviewLink: `${getAppBaseUrl()}/p/${token}`,
    portal,
    reminder,
    language: parseContractProducts(deal.contractProducts)?.language === "en" ? "en" : "da",
  });
  const account = await prisma.emailAccount.findFirst({ where: { provider: "GOOGLE", email: WELCOME_MAIL_SENDER } });
  if (!account) throw new Error(`Ingen forbundet Gmail-konto for ${WELCOME_MAIL_SENDER}. Forbind den under Indstillinger → E-mail.`);
  const kind = reminder ? "review_reminder" : "review";
  try {
    await sendGmailMessage(account, { to: [to], subject: mail.subject, bodyText: mail.bodyText, bodyHtml: mail.bodyHtml, fromName: "Lasse - Nextview360" });
  } catch (err) {
    await prisma.systemMail.create({ data: { dealId: deal.id, accountId: access?.accountId, kind, to, subject: mail.subject, error: (err instanceof Error ? err.message : String(err)).slice(0, 300) } }).catch(() => {});
    throw err;
  }
  await prisma.systemMail.create({ data: { dealId: deal.id, accountId: access?.accountId, kind, to, subject: mail.subject } }).catch(() => {});
  const now = new Date();
  await prisma.tour.update({
    where: { slug },
    data: reminder ? { reviewToken: token, reviewRemindedAt: now, reviewReminders: { increment: 1 } } : { reviewToken: token, reviewSentAt: now, reviewApprovedAt: null, reviewApprovedBy: null },
  });
  await logActivity({ type: "DEAL_UPDATED", message: `${reminder ? "Påmindelse om gennemgang" : "Tour sendt til gennemgang"}: ${dealName(deal)}`, actorId: actor.id, dealId: deal.id });
  return { to, token };
}

/**
 * The tour is approved - by the customer (in the tour or on their page: the
 * team is told) or by us. Approving again changes nothing.
 */
export async function approveTour(slug: string, by: { name: string; customer: boolean; actorId?: string }): Promise<{ already: boolean }> {
  const tour = await prisma.tour.findUnique({ where: { slug }, select: { name: true, reviewApprovedAt: true, dealId: true, deal: { select: { companyName: true, displayName: true } } } });
  if (!tour) throw new Error("Touren findes ikke.");
  if (tour.reviewApprovedAt) return { already: true };
  const who = by.name.trim().slice(0, 80) || (by.customer ? "Kunden" : "Nextview360");
  await prisma.tour.update({ where: { slug }, data: { reviewApprovedAt: new Date(), reviewApprovedBy: by.customer ? `${who} (kunden)` : who } });
  const name = tour.deal ? dealName(tour.deal) : tour.name;
  await logActivity({ type: "DEAL_UPDATED", message: `Touren er godkendt${by.customer ? " af kunden" : ""}: ${name}`, actorId: by.actorId, dealId: tour.dealId });
  if (by.customer) {
    const open = await prisma.tourFeedback.count({ where: { tourSlug: slug, status: "open" } });
    await notifyTeam({
      dealId: tour.dealId,
      subject: `Godkendt af kunden: ${name}`,
      text: `${who} har godkendt touren "${tour.name}".${open ? `\n\nDer er stadig ${open} åben${open === 1 ? "" : "e"} rettelse${open === 1 ? "" : "r"} fra kunden.` : ""}\n\nSe den i editoren: ${getAppBaseUrl()}/arpo/tour-lab/${slug}/rediger`,
    });
  }
  return { already: false };
}
