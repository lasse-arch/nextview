import "server-only";
import { prisma } from "@/lib/db";
import { resendReady, sendSystemMail } from "@/lib/system-mail";
import { dealName } from "@/lib/labels";
import { parseContractProducts } from "@/lib/contract-template-data";
import { logActivity } from "@/lib/activity";
import { getAppBaseUrl } from "@/lib/email-oauth";
import { tourUrl } from "@/lib/public-urls";
import { normalizeEmail, WELCOME_DAYS, welcomeLoginLink } from "@/lib/customer-login";
import { modelIdsIn } from "@/lib/matterport-graph";
import { dealTourMockup } from "@/lib/tour-mockup";

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
  portal?: { link: string; statsLink: string; days: number; /** They have had the page since the review mail - so it isn't news. */ known?: boolean } | null;
  /** The tour's front page on a MacBook goes with the mail (as cid:tour) - shown for the first product. */
  picture?: boolean;
  /** Sent because the customer approved the tour themselves: thanks for that, and they're live now. */
  approved?: boolean;
}): { subject: string; bodyText: string; bodyHtml: string } {
  const firstName = input.contactName?.trim().split(/\s+/)[0] || null;
  const en = input.language === "en";
  const t = en
    ? {
        subject: `Welcome to Nextview360 - ${input.customerName} is live!`,
        greeting: `Hi ${firstName ?? "there"},`,
        intro: "Welcome to Nextview360! We have now done all the hard work, and everything is ready to start working for your business.",
        product: (n: number) => (n === 1 ? "Your finished product:" : "Your finished products:"),
        openTour: (name: string) => `Open ${name === "Virtuel tour" ? "your virtual tour" : name}`,
        website: "Your website:",
        share: "Feel free to share the link on your website, social media and in newsletters - the more it is seen, the more it works for you.",
        contact: (portal: boolean) =>
          portal
            ? `If you have corrections to the tour, you can send them on your customer page or simply reply to this e-mail. If you have any questions, you are also welcome to call ${PHONE}.`
            : `If you have corrections to the tour, just reply to this e-mail. If you have any questions, you are also welcome to call ${PHONE}.`,
        thanks: "Thank you for choosing Nextview360 - we look forward to working with you.",
        bye: "Kind regards",
        portalTitle: "Your own customer page",
        portalIntro: "You also have your own page with us, where you can:",
        portalPoints: ["see how many people visit your tour and what they look at", "send corrections to the tour", "get the code to put the tour on your website", "find your contract"],
        portalButton: "Go to your customer page",
        statsButton: "See your statistics",
        portalAfter: (days: number) => `The buttons log you straight in and work for the next ${days} days. After that, just enter your e-mail at nextview360.dk/login and we send you a new link - no password needed.`,
      }
    : {
        subject: `Velkommen til Nextview360 - ${input.customerName} er live!`,
        greeting: `Hej ${firstName ?? "der"},`,
        intro: "Velkommen til Nextview360! Vi har nu lavet alt det hårde arbejde, og det hele er klar til at arbejde for jeres virksomhed.",
        product: (n: number) => (n === 1 ? "Her er jeres færdige produkt:" : "Her er jeres færdige produkter:"),
        openTour: (name: string) => `Åbn ${name === "Virtuel tour" ? "jeres virtuelle tour" : name}`,
        website: "Jeres hjemmeside:",
        share: "Del gerne linket på jeres hjemmeside, sociale medier og i nyhedsbreve - jo mere det bliver set, jo mere arbejder det for jer.",
        contact: (portal: boolean) =>
          portal
            ? `Har I rettelser til touren, kan I sende dem på jeres kundeside eller svare direkte på denne mail. Har I spørgsmål, er I også velkomne til at ringe på ${PHONE}.`
            : `Har I rettelser til touren, kan I svare direkte på denne mail. Har I spørgsmål, er I også velkomne til at ringe på ${PHONE}.`,
        thanks: "Tak fordi I valgte Nextview360 - vi glæder os til samarbejdet.",
        bye: "Med venlig hilsen",
        portalTitle: "Jeres egen kundeside",
        portalIntro: "I har også fået jeres egen side hos os. Her kan I:",
        portalPoints: ["se hvor mange der besøger jeres tour, og hvad de kigger på", "sende rettelser til touren", "hente koden, så touren kan sættes ind på jeres hjemmeside", "finde jeres kontrakt"],
        portalButton: "Gå til jeres kundeside",
        statsButton: "Se jeres statistik",
        portalAfter: (days: number) => `Knapperne logger jer direkte ind og virker i de næste ${days} dage. Derefter skriver I bare jeres e-mail på nextview360.dk/login, så sender vi et nyt link - der er ingen adgangskode.`,
      };
  if (input.portal?.known) {
    // They already have the page (opened with the review mail, where they sent their corrections) - what's new now it's live.
    t.portalTitle = en ? "Your customer page" : "Jeres kundeside";
    t.portalIntro = en ? "It's the same page where you sent your corrections. Now that the tour is live, you can also:" : "Det er den samme side, hvor I har sendt jeres rettelser. Nu hvor touren er live, kan I også:";
    t.portalPoints = t.portalPoints.filter((_, i) => i !== 1);
  }
  if (input.approved) {
    // The customer approved it themselves - the mail says thanks, and that it's out there now.
    t.subject = en ? `Your tour is live - welcome to Nextview360` : `Jeres tour er live - velkommen til Nextview360`;
    t.intro = en ? "Thank you for approving the tour - it's live now and ready to work for you." : "Tak fordi I har godkendt touren - nu er den live og klar til at arbejde for jer.";
    (t as { product: (n: number) => string }).product = en ? () => "Your finished tour:" : () => "Her er jeres færdige tour:";
    t.share += en ? " We're also happy to help put the tour on your website - just reply to this e-mail." : " Vi hjælper også gerne med at sætte touren ind på jeres hjemmeside - svar bare på denne mail.";
    (t as { contact: (portal: boolean) => string }).contact = en
      ? () => `If you have more changes, you can send them on your customer page or simply reply to this e-mail. If you have any questions, you are welcome to call ${PHONE}.`
      : () => `Har I flere rettelser, kan I sende dem på jeres kundeside eller svare direkte på denne mail. Har I spørgsmål, er I velkomne til at ringe på ${PHONE}.`;
  }
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
  const websiteUrl = !input.approved && website && !products.some((p) => host(p.url) === host(website)) ? website : null;

  const bodyText = [
    t.greeting,
    "",
    t.intro,
    ...(products.length ? ["", t.product(products.length), ...products.map((p) => `${p.name}: ${p.url}`)] : []),
    ...(websiteUrl ? ["", t.website, websiteUrl] : []),
    "",
    t.share,
    ...(input.portal ? ["", t.portalTitle, t.portalIntro, ...t.portalPoints.map((p) => `- ${p}`), "", `${t.portalButton}: ${input.portal.link}`, `${t.statsButton}: ${input.portal.statsLink}`, t.portalAfter(input.portal.days)] : []),
    "",
    t.contact(Boolean(input.portal)),
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
    ? `<p style="margin-bottom:8px">${esc(t.product(products.length))}</p>${products
        .map((p, i) =>
          i === 0 && input.picture
            ? `<a href="${esc(p.url)}" style="display:block;text-decoration:none"><img src="cid:tour" width="520" alt="${esc(p.name)}" style="display:block;width:100%;max-width:520px;height:auto;border:0"></a>
<p style="margin:10px 0 18px;text-align:center"><a href="${esc(p.url)}" style="background:#0071e3;color:#ffffff;text-decoration:none;font-weight:bold;padding:10px 22px;border-radius:999px;display:inline-block">${esc(t.openTour(p.name))}</a></p>`
            : `<p style="margin:6px 0"><a href="${esc(p.url)}" style="color:#0071e3;font-weight:bold;text-decoration:none">${esc(t.openTour(p.name))} &rarr;</a></p>`
        )
        .join("")}`
    : ""
}${websiteUrl ? `<p>${esc(t.website)} <a href="${esc(websiteUrl)}">${esc(websiteUrl.replace(/^https?:\/\//, ""))}</a></p>` : ""}
<p>${esc(t.share)}</p>
${
  input.portal
    ? `<div style="background:#f5f5f7;border-radius:12px;padding:16px 18px;margin:20px 0">
<p style="margin:0 0 6px;font-weight:bold;font-size:15px">${esc(t.portalTitle)}</p>
<p style="margin:0 0 6px">${esc(t.portalIntro)}</p>
<ul style="margin:0 0 14px;padding-left:20px">${t.portalPoints.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
<a href="${esc(input.portal.link)}" style="background:#0071e3;color:#ffffff;text-decoration:none;font-weight:bold;padding:10px 20px;border-radius:999px;display:inline-block;margin:0 8px 8px 0">${esc(t.portalButton)}</a><a href="${esc(input.portal.statsLink)}" style="background:#ffffff;color:#0071e3;text-decoration:none;font-weight:bold;padding:9px 19px;border-radius:999px;display:inline-block;border:1px solid #0071e3;margin:0 0 8px">${esc(t.statsButton)}</a>
<p style="margin:12px 0 0;color:#6e6e73;font-size:12px">${esc(t.portalAfter(input.portal.days))}</p>
</div>`
    : ""
}
<p>${esc(t.contact(Boolean(input.portal))).replace(PHONE, `<a href="tel:+45${PHONE.replace(/\s/g, "")}">${PHONE}</a>`)}</p>
<p>${esc(t.thanks)}</p>
<p>${esc(t.bye)}<br>Lasse<br>Nextview360<br><a href="${NEXTVIEW_URL}">${NEXTVIEW_URL.replace("https://", "")}</a></p>
</div>`;

  return { subject: t.subject, bodyText, bodyHtml };
}

export async function welcomeMailFor(dealId: string, portal: { link: string; statsLink: string; days: number; known?: boolean } | null = null, picture = false, person?: { email: string; name: string | null }) {
  const approvedByCustomer = (await prisma.tour.count({ where: { dealId, reviewApprovedBy: { endsWith: "(kunden)" } } })) > 0;
  const deal = await prisma.deal.findUniqueOrThrow({
    where: { id: dealId },
    include: { items: { where: { url: { not: null } }, orderBy: { createdAt: "asc" } }, tours: { select: { slug: true, name: true, published: true, liveVersion: true } } },
  });
  const mail = buildWelcomeMail({
    contactName: person ? person.name : deal.contactName,
    customerName: dealName(deal),
    // Approved by the customer: the tour just published is the product (its new link) - not an older link on the deal's Ydelser.
    products: deal.items.length && !approvedByCustomer
      ? deal.items.map((i) => ({ name: i.location ? `${i.productType} (${i.location})` : i.productType, url: i.url! }))
      : // No links on Ydelser: the customer's own published tours from Arpo.
        deal.tours.filter((t) => t.published).map((t) => ({ name: deal.tours.length > 1 ? t.name : "Virtuel tour", url: tourUrl(t.slug, getAppBaseUrl(), t.liveVersion != null) })),
    websiteUrl: deal.websiteUrl,
    language: parseContractProducts(deal.contractProducts)?.language === "en" ? "en" : "da",
    portal,
    picture,
    approved: approvedByCustomer,
  });
  return { deal, to: person?.email ?? deal.contactEmail, ...mail };
}

/**
 * What the welcome mail can't go without: the link to their tour, and the
 * customer page for everyone it goes to. Checked before every send (by
 * hand and when the deal goes Live) - a mail without them is never sent.
 */
export async function welcomeMailMissing(dealId: string): Promise<string[]> {
  const deal = await prisma.deal.findUniqueOrThrow({
    where: { id: dealId },
    select: { contactEmail: true, contactName: true, items: { where: { url: { not: null } }, select: { id: true } }, tours: { select: { published: true, reviewEmail: true } } },
  });
  const missing: string[] = [];
  if (!deal.contactEmail) missing.push("Kunden har ingen kontakt-e-mail.");
  if (!deal.items.length && !deal.tours.some((t) => t.published)) missing.push('Linket til touren mangler: tilføj det ved produktet under Ydelser ("+ Tilføj link") - eller udgiv touren i Arpo.');
  const people = [...new Set([deal.contactEmail, ...deal.tours.map((t) => t.reviewEmail)].filter((e): e is string => Boolean(e)).map(normalizeEmail))];
  const withAccess = new Set(
    (await prisma.customerAccountDeal.findMany({ where: { dealId, account: { email: { in: people } } }, select: { account: { select: { email: true } } } })).map((a) => normalizeEmail(a.account.email))
  );
  const without = people.filter((e) => !withAccess.has(e));
  if (without.length) missing.push(`${without.join(" og ")} har ikke adgang til kundesiden endnu: giv adgang under "Kundens login" på dealen.`);
  return missing;
}

/** Sends the welcome mail now (also again, from the deal page's button). */
export async function sendWelcomeMail(dealId: string, actorId: string): Promise<void> {
  const missing = await welcomeMailMissing(dealId);
  if (missing.length) throw new Error(`Velkomstmailen er ikke sendt - der mangler noget: ${missing.join(" ")}`);
  const contact = await prisma.deal.findUniqueOrThrow({ where: { id: dealId }, select: { contactEmail: true, contactName: true, tours: { select: { reviewEmail: true, reviewName: true } } } });
  if (!contact.contactEmail) throw new Error("Kunden har ingen kontakt-e-mail.");
  // The deal's contact - and whoever the tour was sent to for review, when that's someone else (they have the customer page).
  const people = new Map<string, string | null>([[normalizeEmail(contact.contactEmail), contact.contactName]]);
  for (const t of contact.tours) if (t.reviewEmail && !people.has(normalizeEmail(t.reviewEmail))) people.set(normalizeEmail(t.reviewEmail), t.reviewName);
  const sent: string[] = [];
  for (const [email, name] of people) {
    await sendWelcomeMailTo(dealId, actorId, { email, name });
    sent.push(email);
  }
  await prisma.deal.update({ where: { id: dealId }, data: { welcomeMailSentAt: new Date() } });
  await prisma.note.create({ data: { dealId, authorId: actorId, kind: "MANUAL", body: `Velkomstmail sendt til ${sent.join(" og ")}.` } });
}

async function sendWelcomeMailTo(dealId: string, actorId: string, person: { email: string; name: string | null }): Promise<void> {
  // The customer page goes in only when this e-mail has already been given access to this deal (in Arpo, by an admin, or with the review mail) - the mail never gives access by itself.
  const access = await prisma.customerAccountDeal.findFirst({ where: { dealId, account: { email: person.email } }, select: { accountId: true } });
  // Had the page since the review mail: then it's "the same page where you sent your corrections".
  const known = access ? (await prisma.systemMail.count({ where: { dealId, accountId: access.accountId, kind: { in: ["review", "review_reminder"] }, error: null } })) > 0 : false;
  const portal = access ? { link: await welcomeLoginLink(access.accountId), statsLink: await welcomeLoginLink(access.accountId, "tal"), days: WELCOME_DAYS, known } : null;
  // Their tour's front page on a MacBook, sent with the mail (made now - never a blocker: without it, a button).
  const items = await prisma.dealItem.findMany({ where: { dealId, url: { not: null } }, select: { url: true }, orderBy: { createdAt: "asc" }, take: 1 });
  const picture = await dealTourMockup(dealId, items[0]?.url ? (modelIdsIn(items[0].url)[0] ?? null) : null);
  const { deal, to, subject, bodyText, bodyHtml } = await welcomeMailFor(dealId, portal, Boolean(picture), person);
  if (!to) throw new Error("Kunden har ingen kontakt-e-mail.");
  const account = await prisma.emailAccount.findFirst({ where: { provider: "GOOGLE", email: WELCOME_MAIL_SENDER } });
  if (!account && !resendReady()) throw new Error(`Ingen mail-afsender: sæt RESEND_API_KEY i Vercel, eller forbind Gmail for ${WELCOME_MAIL_SENDER} under Indstillinger → E-mail.`);
  try {
    // From Lasse, and answers go to him.
    await sendSystemMail(account, { to: [to], subject, bodyText, bodyHtml, fromName: "Lasse - Nextview360", fromAddress: WELCOME_MAIL_SENDER, replyTo: WELCOME_MAIL_SENDER, inline: picture ? [{ cid: "tour", filename: "tour.jpg", contentType: "image/jpeg", data: picture }] : undefined });
  } catch (err) {
    await prisma.systemMail.create({ data: { dealId, accountId: access?.accountId, kind: "welcome", to, subject, error: (err instanceof Error ? err.message : String(err)).slice(0, 300) } }).catch(() => {});
    throw err;
  }
  await prisma.systemMail.create({ data: { dealId, accountId: access?.accountId, kind: "welcome", to, subject } }).catch(() => {});
  await logActivity({ type: "DEAL_UPDATED", message: `Velkomstmail sendt til ${dealName(deal)} (${to})`, actorId, dealId });
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
      data: { dealId, authorId: actorId, kind: "MANUAL", body: `Velkomstmailen blev ikke sendt: ${reason} Send den fra dealen ("Send nu" under Ydelser), når det er på plads.` },
    });
  }
}
