import "server-only";
import { after } from "next/server";
import { goLiveAfterApproval } from "@/lib/auto-live";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { resendReady, sendSystemMail } from "@/lib/system-mail";
import { getAppBaseUrl } from "@/lib/email-oauth";
import { dealName } from "@/lib/labels";
import { logActivity } from "@/lib/activity";
import { LOGIN_MAIL_FROM, normalizeEmail, welcomeLoginLink, WELCOME_DAYS } from "@/lib/customer-login";
import { PHONE, WELCOME_MAIL_SENDER } from "@/lib/welcome-mail";
import { parseContractProducts } from "@/lib/contract-template-data";
import { notifyTeam } from "@/lib/notification-service";
import { ringBell } from "@/lib/team-notifications";

/*
 * "Send til gennemgang": the customer gets a mail with the tour in its review
 * mode (/p/<token>) - they walk around, leave corrections right where they
 * stand ("Giv feedback"), and press "Godkend touren" when they're happy (in
 * the tour or on their customer page). We can send reminders, and approve it
 * ourselves when we don't hear back. Approving tells the team.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Who gets the review mails: the one chosen when it was sent (reviewEmail), otherwise the deal's contact. */
export function reviewRecipient(tour: { reviewEmail: string | null; reviewName: string | null }, deal: { contactEmail: string | null; contactName: string | null }) {
  const email = tour.reviewEmail ?? deal.contactEmail;
  return email ? { email: normalizeEmail(email), name: tour.reviewEmail ? tour.reviewName : deal.contactName } : null;
}

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
          subject: input.reminder ? `Reminder: your Nextview360 tour is waiting for your feedback - ${input.customerName}` : `Your Nextview360 tour is ready - ${input.customerName}`,
          greeting: `Hi ${first ?? "there"},`,
          intro: input.reminder
            ? "A friendly reminder: your Nextview360 tour is still waiting for you to have a look - we would love to hear what you think before it goes live."
            : "Your Nextview360 tour is ready, and we would love to hear what you think before it goes live.",
          button: "See the tour and give feedback",
          howTitle: "How it works:",
          how: [
            "Walk around the tour as a visitor would.",
            "See something that should be changed? Stand at the spot, press \"Give feedback\" and write what you'd like changed - then we can see exactly where. Or simply reply to this e-mail with your corrections.",
            "Happy with it? Press \"Approve the tour\".",
          ],
          portalTitle: "Your own customer page is now open",
          portal: "Here you can always find the tour and see your corrections - and once the tour is live, you can follow how many visit it and what they look at.",
          portalButton: "Go to your customer page",
          portalAfter: (d: number) => `The button logs you straight in and works once in the next ${d} days. Later, log in at nextview360.dk/login with this e-mail.`,
          contact: `Questions? Just reply to this e-mail or call +45 ${PHONE}.`,
          bye: "Kind regards",
        }
      : {
          subject: input.reminder ? `Påmindelse: Jeres Nextview360-tour venter på jeres feedback - ${input.customerName}` : `Jeres Nextview360-tour er klar - ${input.customerName}`,
          greeting: `Hej ${first ?? "der"},`,
          intro: input.reminder
            ? "En venlig påmindelse: Jeres Nextview360-tour venter stadig på, at I kigger på den - vi vil meget gerne høre, hvad I synes, før den går live."
            : "Jeres Nextview360-tour er klar, og vi vil meget gerne høre, hvad I synes, før den går live.",
          button: "Se touren og giv feedback",
          howTitle: "Sådan gør I:",
          how: [
            "Gå rundt i touren, som en besøgende ville gøre.",
            "Ser I noget, der skal rettes? Stil jer det rigtige sted, tryk \"Giv feedback\" og skriv, hvad I gerne vil have ændret. Så kan vi se præcis hvor. Ellers er I velkomne til at sende rettelser tilbage på denne mail.",
            "Er I tilfredse? Tryk \"Godkend touren\".",
          ],
          portalTitle: "Jeres egen kundeside er nu åben",
          portal: "Her kan I altid finde touren, se jeres rettelser, og når touren er live, kan I følge, hvor mange der besøger den, og hvad de kigger på.",
          portalButton: "Gå til jeres kundeside",
          portalAfter: (d: number) => `Knappen logger jer direkte ind og virker én gang de næste ${d} dage. Senere logger I ind på nextview360.dk/login med denne e-mail.`,
          contact: `Har I spørgsmål, så svar bare direkte på denne mail eller ring på ${PHONE}.`,
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
    ...(input.portal ? ["", t.portalTitle, t.portal, `${t.portalButton}: ${input.portal.link}`, t.portalAfter(input.portal.days)] : []),
    "",
    t.contact,
    "",
    t.bye,
    "Nextview360",
  ].join("\n");
  const pill = (href: string, text: string, primary: boolean) =>
    `<a href="${esc(href)}" style="display:inline-block;padding:11px 20px;border-radius:999px;text-decoration:none;font-weight:bold;${primary ? "background:#0f2a3d;color:#ffffff" : "background:#eef2f5;color:#0f2a3d"}">${esc(text)}</a>`;
  const bodyHtml = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1e293b;max-width:560px">
<p style="margin:0 0 20px"><img src="${esc(getAppBaseUrl())}/logo.png" alt="Nextview360" width="138" height="32" style="display:block;border:0;height:32px;width:auto"></p>
<p>${esc(t.greeting)}</p>
<p>${esc(t.intro)}</p>
<p style="margin:20px 0">${pill(input.reviewLink, t.button, true)}</p>
<p style="margin-bottom:4px"><b>${esc(t.howTitle)}</b></p>
<ol style="margin-top:0;padding-left:20px">${t.how.map((h) => `<li style="margin-bottom:4px">${esc(h)}</li>`).join("")}</ol>
${input.portal ? `<p style="margin:24px 0 4px"><b>${esc(t.portalTitle)}</b></p><p style="margin-top:0">${esc(t.portal)}</p><p>${pill(input.portal.link, t.portalButton, false)}</p><p style="font-size:12px;color:#64748b">${esc(t.portalAfter(input.portal.days))}</p>` : ""}
<p style="margin-top:20px">${esc(t.contact)}</p>
<p>${esc(t.bye)}<br>Nextview360</p>
</div>`;
  return { subject: t.subject, bodyText, bodyHtml };
}

/** "Jeres rettelser er lavet": the corrections they sent are done - see the tour again and approve it. */
export function buildFixesDoneMail(input: {
  contactName: string | null;
  customerName: string;
  reviewLink: string;
  /** The customer's own words, one per correction (outside text: only ever escaped). */
  fixes: string[];
  language: "da" | "en";
}): { subject: string; bodyText: string; bodyHtml: string } {
  const first = input.contactName?.trim().split(/\s+/)[0] || null;
  const t =
    input.language === "en"
      ? {
          subject: `Your corrections are done - ${input.customerName}`,
          greeting: `Hi ${first ?? "there"},`,
          intro: "We have now made all the corrections you sent for your Nextview360 tour.",
          fixedTitle: "What we have corrected:",
          ask: "Have another look at the tour and approve it if everything looks right. Then we put it out, and it is ready to be shared.",
          button: "See the tour and approve",
          more: "If anything still needs correcting, you can write it directly in the tour as before or reply to this e-mail.",
          bye: "Kind regards",
        }
      : {
          subject: `Jeres rettelser er lavet - ${input.customerName}`,
          greeting: `Hej ${first ?? "der"},`,
          intro: "Nu har vi lavet alle de rettelser, I sendte til jeres Nextview360-tour.",
          fixedTitle: "Det har vi rettet:",
          ask: "Se touren igen, og godkend den, hvis alt ser rigtigt ud. Så lægger vi den ud, og den er klar til at blive delt.",
          button: "Se touren og godkend",
          more: "Er der stadig noget, der skal rettes, kan I skrive det direkte i touren som før eller svare på denne mail.",
          bye: "Med venlig hilsen",
        };
  // Their own words, shortened and on one line each.
  const fixes = input.fixes.map((f) => f.replace(/\s+/g, " ").trim()).filter(Boolean).map((f) => (f.length > 200 ? `${f.slice(0, 197)}...` : f));
  const bodyText = [
    t.greeting,
    "",
    t.intro,
    ...(fixes.length ? ["", t.fixedTitle, ...fixes.map((f) => `- ${f}`)] : []),
    "",
    t.ask,
    "",
    `${t.button}: ${input.reviewLink}`,
    "",
    t.more,
    "",
    t.bye,
    "Nextview360",
  ].join("\n");
  const bodyHtml = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1e293b;max-width:560px">
<p style="margin:0 0 20px"><img src="${esc(getAppBaseUrl())}/logo.png" alt="Nextview360" width="138" height="32" style="display:block;border:0;height:32px;width:auto"></p>
<p>${esc(t.greeting)}</p>
<p>${esc(t.intro)}</p>
${fixes.length ? `<p style="margin-bottom:4px"><b>${esc(t.fixedTitle)}</b></p><ul style="margin-top:0;padding-left:20px">${fixes.map((f) => `<li style="margin-bottom:4px">${esc(f)}</li>`).join("")}</ul>` : ""}
<p>${esc(t.ask)}</p>
<p style="margin:20px 0"><a href="${esc(input.reviewLink)}" style="display:inline-block;padding:11px 20px;border-radius:999px;text-decoration:none;font-weight:bold;background:#0f2a3d;color:#ffffff">${esc(t.button)}</a></p>
<p>${esc(t.more)}</p>
<p>${esc(t.bye)}<br>Nextview360</p>
</div>`;
  return { subject: t.subject, bodyText, bodyHtml };
}

/**
 * When the last open correction on a tour is marked done: the customer is
 * told in one mail (from info@, answers go there) with what was corrected
 * and the review link to approve. Only while the tour is out for review and
 * not approved, and only corrections they haven't been told about - marking
 * one done again (after reopening it) sends nothing new. Returns who was
 * mailed, or null when no mail was due.
 */
export async function sendFixesDoneMail(slug: string, actor: { id: string; name: string }, manual = false): Promise<string | null> {
  const tour = await prisma.tour.findUnique({
    where: { slug },
    select: { reviewToken: true, reviewSentAt: true, reviewApprovedAt: true, reviewEmail: true, reviewName: true, deal: { select: { id: true, companyName: true, displayName: true, contactName: true, contactEmail: true, contractProducts: true } } },
  });
  const deal = tour?.deal;
  const who = tour && deal ? reviewRecipient(tour, deal) : null;
  // Pressed by hand ("Send nu"): also with corrections still open, and then with every done one if all were told before.
  if (manual) {
    if (!tour?.reviewToken) throw new Error("Touren er ikke sendt til gennemgang endnu - der er intet link at sende.");
    if (!who) throw new Error("Kunden har ingen kontakt-e-mail på dealen.");
  } else {
    if (!tour?.reviewToken || !tour.reviewSentAt || tour.reviewApprovedAt || !deal || !who) return null;
    if (await prisma.tourFeedback.count({ where: { tourSlug: slug, status: "open" } })) return null;
  }
  const done = (reportedAt: null | undefined) => prisma.tourFeedback.findMany({ where: { tourSlug: slug, status: "done", ...(reportedAt === null ? { reportedAt: null } : {}) }, orderBy: { createdAt: "asc" }, take: 30, select: { id: true, text: true } });
  let fixes = await done(null);
  if (!fixes.length && manual) fixes = await done(undefined);
  if (!fixes.length && !manual) return null;
  if (!deal || !who) return null;
  const to = who.email;
  if (!EMAIL.test(to)) throw new Error(`E-mailen ser forkert ud (${to}).`);
  const sender = await prisma.emailAccount.findFirst({ where: { provider: "GOOGLE", email: WELCOME_MAIL_SENDER } });
  const canSend = Boolean(sender) || resendReady();
  const dev = !canSend && process.env.NODE_ENV !== "production";
  if (!canSend && !dev) throw new Error(`Ingen mail-afsender: sæt RESEND_API_KEY i Vercel, eller forbind Gmail for ${WELCOME_MAIL_SENDER} under Indstillinger → E-mail.`);
  const mail = buildFixesDoneMail({
    contactName: who.name,
    customerName: dealName(deal),
    reviewLink: `${getAppBaseUrl()}/p/${tour.reviewToken}`,
    fixes: fixes.map((f) => f.text),
    language: parseContractProducts(deal.contractProducts)?.language === "en" ? "en" : "da",
  });
  // Marked as told first: two quick presses mustn't send it twice (a failed send puts them back).
  const ids = fixes.map((f) => f.id);
  const claimed = await prisma.tourFeedback.updateMany({ where: { id: { in: ids }, ...(manual ? {} : { reportedAt: null }) }, data: { reportedAt: new Date() } });
  if (claimed.count !== ids.length) return null;
  if (canSend) {
    try {
      await sendSystemMail(sender, { to: [to], subject: mail.subject, bodyText: mail.bodyText, bodyHtml: mail.bodyHtml, fromName: "Nextview360", fromAddress: LOGIN_MAIL_FROM, replyTo: LOGIN_MAIL_FROM });
    } catch (err) {
      await prisma.tourFeedback.updateMany({ where: { id: { in: ids } }, data: { reportedAt: null } }).catch(() => {});
      await prisma.systemMail.create({ data: { dealId: deal.id, kind: "review_fixed", to, subject: mail.subject, error: (err instanceof Error ? err.message : String(err)).slice(0, 300) } }).catch(() => {});
      throw err;
    }
  } else {
    // On a developer's machine there's no Gmail to send from - the mail goes to the server log instead.
    console.log(`[rettelser lavet] Mail til ${to}: ${mail.subject}\n${mail.bodyText}`);
  }
  await prisma.systemMail.create({ data: { dealId: deal.id, kind: "review_fixed", to, subject: mail.subject } }).catch(() => {});
  await logActivity({ type: "DEAL_UPDATED", message: `Rettelser lavet - mail sendt til ${to}: ${dealName(deal)}`, actorId: actor.id, dealId: deal.id });
  return to;
}

/**
 * Sends the review mail (or a reminder) to the customer's contact e-mail -
 * from info@nextview360.dk (answers go there) - and opens their customer
 * page for that e-mail (as "Giv kunden adgang" does: the deal and its
 * locations, nothing else), with a login button in the same mail. Turns the
 * review link on if it's off.
 */
export async function sendReviewMail(
  slug: string,
  actor: { id: string; name: string },
  reminder: boolean,
  /** Someone else than the deal's contact (kept for reminders and "rettelser lavet"). Empty e-mail = back to the contact. */
  recipient?: { email: string; name: string },
): Promise<{ to: string; token: string }> {
  const tour = await prisma.tour.findUnique({
    where: { slug },
    select: { slug: true, reviewToken: true, reviewApprovedAt: true, reviewEmail: true, reviewName: true, deal: { select: { id: true, companyName: true, displayName: true, contactName: true, contactEmail: true, contractProducts: true, branches: { select: { id: true } } } } },
  });
  const deal = tour?.deal;
  if (!tour || !deal) throw new Error("Touren er ikke koblet til en kunde i Arpo.");
  // A chosen recipient: their own e-mail (none = the deal's contact again) - saved with the tour once the mail is sent.
  const chosen = recipient
    ? recipient.email.trim() && normalizeEmail(recipient.email) !== normalizeEmail(deal.contactEmail ?? "")
      ? { reviewEmail: normalizeEmail(recipient.email).slice(0, 200), reviewName: recipient.name.trim().slice(0, 120) || null }
      : { reviewEmail: null, reviewName: null }
    : { reviewEmail: tour.reviewEmail, reviewName: tour.reviewName };
  const who = reviewRecipient(chosen, deal);
  if (!who) throw new Error("Kunden har ingen kontakt-e-mail på dealen - tilføj den først, eller skriv en e-mail herover.");
  const to = who.email;
  if (!EMAIL.test(to)) throw new Error(`E-mailen ser forkert ud (${to}).`);
  const sender = await prisma.emailAccount.findFirst({ where: { provider: "GOOGLE", email: WELCOME_MAIL_SENDER } });
  const canSend = Boolean(sender) || resendReady();
  const dev = !canSend && process.env.NODE_ENV !== "production";
  if (!canSend && !dev) throw new Error(`Ingen mail-afsender: sæt RESEND_API_KEY i Vercel, eller forbind Gmail for ${WELCOME_MAIL_SENDER} under Indstillinger → E-mail.`);
  const token = tour.reviewToken ?? randomBytes(12).toString("base64url");

  // Their customer page: the contact e-mail gets access to this deal (and its locations) - only the deal's own contact.
  const existing = await prisma.customerAccount.findUnique({ where: { email: to }, select: { id: true, deals: { where: { dealId: deal.id }, select: { dealId: true } } } });
  const account =
    existing ??
    (await prisma.customerAccount.create({ data: { email: to, name: who.name?.trim() || null, invitedByName: actor.name }, select: { id: true, deals: { select: { dealId: true } } } }));
  const newAccess = !account.deals.length;
  for (const id of [deal.id, ...deal.branches.map((b) => b.id)]) {
    await prisma.customerAccountDeal.upsert({ where: { accountId_dealId: { accountId: account.id, dealId: id } }, create: { accountId: account.id, dealId: id }, update: {} });
  }
  const portal = { link: await welcomeLoginLink(account.id), days: WELCOME_DAYS };

  const mail = buildReviewMail({
    contactName: who.name,
    customerName: dealName(deal),
    reviewLink: `${getAppBaseUrl()}/p/${token}`,
    portal,
    reminder,
    language: parseContractProducts(deal.contractProducts)?.language === "en" ? "en" : "da",
  });
  const kind = reminder ? "review_reminder" : "review";
  if (canSend) {
    try {
      await sendSystemMail(sender, { to: [to], subject: mail.subject, bodyText: mail.bodyText, bodyHtml: mail.bodyHtml, fromName: "Nextview360", fromAddress: LOGIN_MAIL_FROM, replyTo: LOGIN_MAIL_FROM });
    } catch (err) {
      await prisma.systemMail.create({ data: { dealId: deal.id, accountId: account.id, kind, to, subject: mail.subject, error: (err instanceof Error ? err.message : String(err)).slice(0, 300) } }).catch(() => {});
      throw err;
    }
  } else {
    // On a developer's machine there's no Gmail to send from - the links go to the server log instead.
    console.log(`[gennemgang] Mail til ${to}: ${mail.subject}\n${mail.bodyText}`);
  }
  await prisma.systemMail.create({ data: { dealId: deal.id, accountId: account.id, kind, to, subject: mail.subject } }).catch(() => {});
  if (newAccess) await prisma.note.create({ data: { dealId: deal.id, authorId: actor.id, kind: "MANUAL", body: `Kundesiden åbnet for ${to} med mailen om gennemgang af touren.` } }).catch(() => {});
  const now = new Date();
  await prisma.tour.update({
    where: { slug },
    data: reminder ? { ...chosen, reviewToken: token, reviewRemindedAt: now, reviewReminders: { increment: 1 } } : { ...chosen, reviewToken: token, reviewSentAt: now, reviewApprovedAt: null, reviewApprovedBy: null },
  });
  await logActivity({ type: "DEAL_UPDATED", message: `${reminder ? "Påmindelse om gennemgang" : "Tour sendt til gennemgang"}${newAccess ? " (kundesiden åbnet)" : ""}: ${dealName(deal)}`, actorId: actor.id, dealId: deal.id });
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
    await ringBell({
      kind: "approved",
      title: `Godkendt af kunden: ${name}`,
      text: `${who} har godkendt touren.${open ? ` ${open} åben${open === 1 ? "" : "e"} rettelse${open === 1 ? "" : "r"}.` : ""}`,
      href: `/arpo/tour-lab/${slug}/rediger?fane=feedback`,
      tourSlug: slug,
    });
    await notifyTeam({
      dealId: tour.dealId,
      subject: `Godkendt af kunden: ${name}`,
      text: `${who} har godkendt touren "${tour.name}".${open ? `\n\nDer er stadig ${open} åben${open === 1 ? "" : "e"} rettelse${open === 1 ? "" : "r"} fra kunden.` : ""}\n\nSe den i editoren: ${getAppBaseUrl()}/arpo/tour-lab/${slug}/rediger`,
    });
    // Then out it goes by itself: published, Live, the welcome mail (after the answer - it takes a while).
    after(() => goLiveAfterApproval(slug).catch((err) => console.error("[auto-live]", slug, err)));
  }
  return { already: false };
}
