import "server-only";
import { prisma } from "@/lib/db";
import { sendGmailMessage } from "@/lib/gmail";
import { dealName } from "@/lib/labels";
import { parseContractProducts } from "@/lib/contract-template-data";
import { logActivity } from "@/lib/activity";
import { getAppBaseUrl } from "@/lib/email-oauth";
import { tourUrl } from "@/lib/public-urls";
import { normalizeEmail, WELCOME_DAYS, welcomeLoginLink } from "@/lib/customer-login";

/** The welcome mail goes from Lasse's mailbox, so replies land with him. */
export const WELCOME_MAIL_SENDER = "lasse@nextview360.dk";
export const PHONE = "23 27 07 86";
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
  /** The links on the deal's Ydelser (tour, hjemmeside, …). */
  products: { name: string; url: string }[];
  websiteUrl: string | null;
  language: "da" | "en";
  /** A login link to their own customer page (nextview360.dk/kunde), when they have been given access. */
  portal?: { link: string; days: number } | null;
}): { subject: string; bodyText: string; bodyHtml: string } {
  const firstName = input.contactName?.trim().split(/\s+/)[0] || null;
  const en = input.language === "en";
  const t = en
    ? {
        subject: `Welcome to Nextview360 - ${input.customerName} is live!`,
        greeting: `Hi ${firstName ?? "there"},`,
        intro: "Welcome to Nextview360! We have now done all the hard work, and everything is ready to start working for your business.",
        product: (n: number) => (n === 1 ? "Your finished product:" : "Your finished products:"),
        open: "Open",
        website: "Your website:",
        share: "Feel free to share the link on your website, social media and in newsletters - the more it is seen, the more it works for you.",
        contact: `If you need changes or have any questions, you are always welcome to e-mail ${WELCOME_MAIL_SENDER} or call ${PHONE}.`,
        thanks: "Thank you for choosing Nextview360 - we look forward to working with you.",
        bye: "Kind regards",
        portalTitle: "Your own customer page",
        portalIntro: "You also have your own page with us, where you can:",
        portalPoints: ["see how many people visit your tour and what they look at", "get the code to put the tour on your website", "find your contract"],
        portalButton: "Go to your customer page",
        portalAfter: (days: number) => `The button works once in the next ${days} days. After that, just enter your e-mail at nextview360.dk/login and we send you a new link - no password needed.`,
      }
    : {
        subject: `Velkommen til Nextview360 - ${input.customerName} er live!`,
        greeting: `Hej ${firstName ?? "der"},`,
        intro: "Velkommen til Nextview360! Vi har nu lavet alt det hårde arbejde, og det hele er klar til at arbejde for jeres virksomhed.",
        product: (n: number) => (n === 1 ? "Her er jeres færdige produkt:" : "Her er jeres færdige produkter:"),
        open: "Åbn",
        website: "Jeres hjemmeside:",
        share: "Del gerne linket på jeres hjemmeside, sociale medier og i nyhedsbreve - jo mere det bliver set, jo mere arbejder det for jer.",
        contact: `Hvis I har behov for ændringer eller har spørgsmål, er I altid velkomne til at sende en mail til ${WELCOME_MAIL_SENDER} eller ringe på ${PHONE}.`,
        thanks: "Tak fordi I valgte Nextview360 - vi glæder os til samarbejdet.",
        bye: "Med venlig hilsen",
        portalTitle: "Jeres egen kundeside",
        portalIntro: "I har også fået jeres egen side hos os. Her kan I:",
        portalPoints: ["se hvor mange der besøger jeres tour, og hvad de kigger på", "hente koden, så touren kan sættes ind på jeres hjemmeside", "finde jeres kontrakt"],
        portalButton: "Gå til jeres kundeside",
        portalAfter: (days: number) => `Knappen virker én gang i de næste ${days} dage. Derefter skriver I bare jeres e-mail på nextview360.dk/login, så sender vi et nyt link - der er ingen adgangskode.`,
      };
  const products = input.products
    .filter((p) => p.url.trim())
    .map((p) => ({ name: p.name, url: withProtocol(p.url.trim()) }));
  const host = (url: string) => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  };
  // Their own website, unless it's already one of the delivered links.
  const website = input.websiteUrl?.trim() ? withProtocol(input.websiteUrl.trim()) : null;
  const websiteUrl = website && !products.some((p) => host(p.url) === host(website)) ? website : null;

  const bodyText = [
    t.greeting,
    "",
    t.intro,
    ...(products.length ? ["", t.product(products.length), ...products.map((p) => `${p.name}: ${p.url}`)] : []),
    ...(websiteUrl ? ["", t.website, websiteUrl] : []),
    "",
    t.share,
    ...(input.portal ? ["", t.portalTitle, t.portalIntro, ...t.portalPoints.map((p) => `- ${p}`), "", `${t.portalButton}: ${input.portal.link}`, t.portalAfter(input.portal.days)] : []),
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
  products.length
    ? `<p style="margin-bottom:4px">${esc(t.product(products.length))}</p>
<table style="border-collapse:collapse;margin:8px 0 16px">${products
        .map(
          (p) =>
            `<tr><td style="padding:6px 16px 6px 0;font-weight:bold">${esc(p.name)}</td><td style="padding:6px 0"><a href="${esc(p.url)}" style="background:#b91c1c;color:#ffffff;text-decoration:none;font-weight:bold;padding:8px 18px;border-radius:999px;display:inline-block">${esc(t.open)}</a></td></tr>`
        )
        .join("")}</table>`
    : ""
}${websiteUrl ? `<p>${esc(t.website)} <a href="${esc(websiteUrl)}">${esc(websiteUrl.replace(/^https?:\/\//, ""))}</a></p>` : ""}
<p>${esc(t.share)}</p>
${
  input.portal
    ? `<div style="background:#f5f5f7;border-radius:12px;padding:16px 18px;margin:20px 0">
<p style="margin:0 0 6px;font-weight:bold;font-size:15px">${esc(t.portalTitle)}</p>
<p style="margin:0 0 6px">${esc(t.portalIntro)}</p>
<ul style="margin:0 0 14px;padding-left:20px">${t.portalPoints.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
<a href="${esc(input.portal.link)}" style="background:#0071e3;color:#ffffff;text-decoration:none;font-weight:bold;padding:10px 20px;border-radius:999px;display:inline-block">${esc(t.portalButton)}</a>
<p style="margin:12px 0 0;color:#6e6e73;font-size:12px">${esc(t.portalAfter(input.portal.days))}</p>
</div>`
    : ""
}
<p>${esc(t.contact).replace(esc(WELCOME_MAIL_SENDER), `<a href="mailto:${WELCOME_MAIL_SENDER}">${WELCOME_MAIL_SENDER}</a>`).replace(PHONE, `<a href="tel:+45${PHONE.replace(/\s/g, "")}">${PHONE}</a>`)}</p>
<p>${esc(t.thanks)}</p>
<p>${esc(t.bye)}<br>Lasse<br>Nextview360<br><a href="${NEXTVIEW_URL}">${NEXTVIEW_URL.replace("https://", "")}</a></p>
</div>`;

  return { subject: t.subject, bodyText, bodyHtml };
}

export async function welcomeMailFor(dealId: string, portal: { link: string; days: number } | null = null) {
  const deal = await prisma.deal.findUniqueOrThrow({
    where: { id: dealId },
    include: { items: { where: { url: { not: null } }, orderBy: { createdAt: "asc" } }, tours: { select: { slug: true, name: true, published: true, liveVersion: true } } },
  });
  const mail = buildWelcomeMail({
    contactName: deal.contactName,
    customerName: dealName(deal),
    products: deal.items.length
      ? deal.items.map((i) => ({ name: i.location ? `${i.productType} (${i.location})` : i.productType, url: i.url! }))
      : // No links on Ydelser: the customer's own published tours from Arpo.
        deal.tours.filter((t) => t.published).map((t) => ({ name: deal.tours.length > 1 ? t.name : "Virtuel tour", url: tourUrl(t.slug, getAppBaseUrl(), t.liveVersion != null) })),
    websiteUrl: deal.websiteUrl,
    language: parseContractProducts(deal.contractProducts)?.language === "en" ? "en" : "da",
    portal,
  });
  return { deal, to: deal.contactEmail, ...mail };
}

/** Sends the welcome mail now (also again, from the deal page's button). */
export async function sendWelcomeMail(dealId: string, actorId: string): Promise<void> {
  const contact = await prisma.deal.findUniqueOrThrow({ where: { id: dealId }, select: { contactEmail: true } });
  if (!contact.contactEmail) throw new Error("Kunden har ingen kontakt-e-mail.");
  // The customer page goes in only when this e-mail has already been given access to this deal (in Arpo, by an admin) - the mail never gives access by itself.
  const access = await prisma.customerAccountDeal.findFirst({ where: { dealId, account: { email: normalizeEmail(contact.contactEmail) } }, select: { accountId: true } });
  const portal = access ? { link: await welcomeLoginLink(access.accountId), days: WELCOME_DAYS } : null;
  const { deal, to, subject, bodyText, bodyHtml } = await welcomeMailFor(dealId, portal);
  if (!to) throw new Error("Kunden har ingen kontakt-e-mail.");
  const account = await prisma.emailAccount.findFirst({ where: { provider: "GOOGLE", email: WELCOME_MAIL_SENDER } });
  if (!account) throw new Error(`Ingen forbundet Gmail-konto for ${WELCOME_MAIL_SENDER}. Forbind den under Indstillinger → E-mail.`);
  try {
    await sendGmailMessage(account, { to: [to], subject, bodyText, bodyHtml, fromName: "Lasse - Nextview360" });
  } catch (err) {
    await prisma.systemMail.create({ data: { dealId, accountId: access?.accountId, kind: "welcome", to, subject, error: (err instanceof Error ? err.message : String(err)).slice(0, 300) } }).catch(() => {});
    throw err;
  }
  await prisma.systemMail.create({ data: { dealId, accountId: access?.accountId, kind: "welcome", to, subject } }).catch(() => {});
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
