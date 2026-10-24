import "server-only";
import { prisma } from "@/lib/db";
import { sendGmailMessage } from "@/lib/gmail";
import { dealName } from "@/lib/labels";
import { parseContractProducts } from "@/lib/contract-template-data";
import { logActivity } from "@/lib/activity";

/** The welcome mail goes from Lasse's mailbox, so replies land with him. */
export const WELCOME_MAIL_SENDER = "lasse@nextview360.dk";
const PHONE = "23 27 07 86";
const NEXTVIEW_URL = "https://www.nextview360.dk";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function withProtocol(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

export function buildWelcomeMail(input: {
  contactName: string | null;
  customerName: string;
  productUrl: string | null;
  websiteUrl: string | null;
  language: "da" | "en";
}): { subject: string; bodyText: string; bodyHtml: string } {
  const firstName = input.contactName?.trim().split(/\s+/)[0] || null;
  const en = input.language === "en";
  const t = en
    ? {
        subject: `Welcome to Nextview360 - ${input.customerName} is live!`,
        greeting: `Hi ${firstName ?? "there"},`,
        intro: "Welcome to Nextview360! We have now done all the hard work, and everything is ready to start working for your business.",
        product: "Your finished product:",
        productButton: "See your virtual tour",
        website: "Your website:",
        share: "Feel free to share the link on your website, social media and in newsletters - the more it is seen, the more it works for you.",
        contact: `If you need changes or have any questions, you are always welcome to e-mail ${WELCOME_MAIL_SENDER} or call ${PHONE}.`,
        thanks: "Thank you for choosing Nextview360 - we look forward to working with you.",
        bye: "Kind regards",
      }
    : {
        subject: `Velkommen til Nextview360 - ${input.customerName} er live!`,
        greeting: `Hej ${firstName ?? "der"},`,
        intro: "Velkommen til Nextview360! Vi har nu lavet alt det hårde arbejde, og det hele er klar til at arbejde for jeres virksomhed.",
        product: "Her er jeres færdige produkt:",
        productButton: "Se jeres virtuelle tour",
        website: "Jeres hjemmeside:",
        share: "Del gerne linket på jeres hjemmeside, sociale medier og i nyhedsbreve - jo mere det bliver set, jo mere arbejder det for jer.",
        contact: `Hvis I har behov for ændringer eller har spørgsmål, er I altid velkomne til at sende en mail til ${WELCOME_MAIL_SENDER} eller ringe på ${PHONE}.`,
        thanks: "Tak fordi I valgte Nextview360 - vi glæder os til samarbejdet.",
        bye: "Med venlig hilsen",
      };
  const productUrl = input.productUrl?.trim() ? withProtocol(input.productUrl.trim()) : null;
  const websiteUrl = input.websiteUrl?.trim() ? withProtocol(input.websiteUrl.trim()) : null;

  const bodyText = [
    t.greeting,
    "",
    t.intro,
    ...(productUrl ? ["", t.product, productUrl] : []),
    ...(websiteUrl ? ["", t.website, websiteUrl] : []),
    "",
    t.share,
    "",
    t.contact,
    "",
    t.thanks,
    "",
    t.bye,
    "Lasse",
    "Nextview360",
    NEXTVIEW_URL.replace("https://", ""),
  ].join("\n");

  const bodyHtml = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1e293b;max-width:560px">
<p>${esc(t.greeting)}</p>
<p>${esc(t.intro)}</p>
${
  productUrl
    ? `<p style="margin-bottom:4px">${esc(t.product)}</p>
<p style="margin:12px 0 20px"><a href="${esc(productUrl)}" style="background:#b91c1c;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px;display:inline-block">${esc(t.productButton)}</a></p>`
    : ""
}${websiteUrl ? `<p>${esc(t.website)} <a href="${esc(websiteUrl)}">${esc(websiteUrl.replace(/^https?:\/\//, ""))}</a></p>` : ""}
<p>${esc(t.share)}</p>
<p>${esc(t.contact).replace(esc(WELCOME_MAIL_SENDER), `<a href="mailto:${WELCOME_MAIL_SENDER}">${WELCOME_MAIL_SENDER}</a>`).replace(PHONE, `<a href="tel:+45${PHONE.replace(/\s/g, "")}">${PHONE}</a>`)}</p>
<p>${esc(t.thanks)}</p>
<p>${esc(t.bye)}<br>Lasse<br>Nextview360<br><a href="${NEXTVIEW_URL}">${NEXTVIEW_URL.replace("https://", "")}</a></p>
</div>`;

  return { subject: t.subject, bodyText, bodyHtml };
}

export async function welcomeMailFor(dealId: string) {
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  const mail = buildWelcomeMail({
    contactName: deal.contactName,
    customerName: dealName(deal),
    productUrl: deal.productUrl,
    websiteUrl: deal.websiteUrl,
    language: parseContractProducts(deal.contractProducts)?.language === "en" ? "en" : "da",
  });
  return { deal, to: deal.contactEmail, ...mail };
}

/** Sends the welcome mail now (also again, from the deal page's button). */
export async function sendWelcomeMail(dealId: string, actorId: string): Promise<void> {
  const { deal, to, subject, bodyText, bodyHtml } = await welcomeMailFor(dealId);
  if (!to) throw new Error("Kunden har ingen kontakt-e-mail.");
  const account = await prisma.emailAccount.findFirst({ where: { provider: "GOOGLE", email: WELCOME_MAIL_SENDER } });
  if (!account) throw new Error(`Ingen forbundet Gmail-konto for ${WELCOME_MAIL_SENDER}. Forbind den under Indstillinger → E-mail.`);
  await sendGmailMessage(account, { to: [to], subject, bodyText, bodyHtml, fromName: "Lasse - Nextview360" });
  await prisma.deal.update({ where: { id: dealId }, data: { welcomeMailSentAt: new Date() } });
  await prisma.note.create({ data: { dealId, authorId: actorId, kind: "MANUAL", body: `Velkomstmail sendt til ${to}.` } });
  await logActivity({ type: "DEAL_UPDATED", message: `Velkomstmail sendt til ${dealName(deal)}`, actorId, dealId });
}

/**
 * The first time a deal is set Live, the customer automatically gets the
 * "Velkommen til Nextview360" mail. Never blocks or fails going Live - a
 * failure is left as a note on the deal, and the mail can be sent from
 * the deal page instead.
 */
export async function sendWelcomeMailOnLive(
  dealId: string,
  previousStage: string,
  newStage: string,
  actorId: string
): Promise<void> {
  if (newStage !== "LIVE" || previousStage === "LIVE") return;
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  if (deal.welcomeMailSentAt) return;
  try {
    await sendWelcomeMail(dealId, actorId);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Ukendt fejl";
    await prisma.note.create({
      data: { dealId, authorId: actorId, kind: "MANUAL", body: `Velkomstmailen blev ikke sendt: ${reason}` },
    });
  }
}
