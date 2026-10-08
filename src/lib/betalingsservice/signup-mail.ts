/**
 * The "tilmeld Betalingsservice" e-mail: sent from lasse@nextview360.dk's
 * connected Gmail to customers on Betalingsservice who haven't signed up
 * yet, with a button to the BS Tilmeldingslink (sign-up with MitID, made in
 * Mastercard Connect → BS Customer Portal) and the numbers to sign up with.
 */
import { prisma } from "@/lib/db";
import { sendGmailMessage } from "@/lib/gmail";
import { dealName } from "@/lib/labels";
import { parseContractProducts } from "@/lib/contract-template-data";
import { bsPayerOf, ensureBsCustomerNumber, getBsSettings } from "./service";

export const SIGNUP_MAIL_SENDER = "lasse@nextview360.dk";
const BATCH_SIZE = 10;
const CUSTOMER_STAGES = ["CONTRACT_SIGNED", "FILMED", "LIVE"] as const;

/** A link made "med kundeoplysninger" can hold {kundenr}, filled in per customer. */
export function signupLinkFor(link: string, customerNumber: string): string {
  return link.replaceAll("{kundenr}", encodeURIComponent(customerNumber));
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildSignupMail(input: {
  contactName: string | null;
  customerName: string;
  customerNumber: string;
  /** The customer's own CVR - the Standard sign-up link asks for it. */
  cvrNumber?: string | null;
  pbsNumber: string;
  debtorGroupNumber: string;
  signupLink: string;
  language: "da" | "en";
}): { subject: string; bodyText: string; bodyHtml: string } {
  const link = signupLinkFor(input.signupLink, input.customerNumber);
  const firstName = input.contactName?.trim().split(/\s+/)[0] || null;
  const en = input.language === "en";
  const t = en
    ? {
        subject: "Pay Nextview360 automatically with Betalingsservice",
        greeting: `Hi ${firstName ?? "there"},`,
        intro:
          "You can now pay your Nextview360 subscription automatically via Betalingsservice. The amount is then paid on the due date, and you no longer have to pay the invoices by hand. You will still receive the invoice from us by e-mail.",
        cta: "It takes a minute to sign up with MitID:",
        button: "Sign up for Betalingsservice",
        numbers: `You need these details (${input.customerName}):`,
        labels: ["PBS no.", "Debtor group", "Customer no."],
        bank: "You can also sign up in your online banking with the same details.",
        questions: "If you have any questions, just reply to this e-mail.",
        bye: "Kind regards",
      }
    : {
        subject: "Betal Nextview360 automatisk med Betalingsservice",
        greeting: `Hej ${firstName ?? "der"},`,
        intro:
          "Fremover kan I betale jeres abonnement hos Nextview360 automatisk via Betalingsservice. Så bliver beløbet trukket på forfaldsdagen, og I slipper for at betale fakturaerne manuelt. I får stadig fakturaen fra os på mail.",
        cta: "Det tager et minut at tilmelde sig med MitID:",
        button: "Tilmeld Betalingsservice",
        numbers: `I skal bruge disse oplysninger (${input.customerName}):`,
        labels: ["PBS-nr.", "Debitorgruppe", "Kundenummer"],
        bank: "I kan også tilmelde jer i jeres netbank med de samme oplysninger.",
        questions: "Har I spørgsmål, så svar bare på denne mail.",
        bye: "Med venlig hilsen",
      };
  const cvr = (input.cvrNumber ?? "").replace(/\D/g, "");
  const rows: [string, string][] = [
    ...(cvr.length === 8 ? [[en ? "Your CVR no." : "Jeres CVR-nr.", cvr] as [string, string]] : []),
    [t.labels[2], input.customerNumber],
    [t.labels[0], input.pbsNumber],
    [t.labels[1], input.debtorGroupNumber],
  ];

  const bodyText = [
    t.greeting,
    "",
    t.intro,
    "",
    t.cta,
    link,
    "",
    t.numbers,
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    t.bank,
    "",
    t.questions,
    "",
    t.bye,
    "Nextview360 ApS",
  ].join("\n");

  const bodyHtml = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1e293b;max-width:560px">
<p>${esc(t.greeting)}</p>
<p>${esc(t.intro)}</p>
<p>${esc(t.cta)}</p>
<p style="margin:20px 0"><a href="${esc(link)}" style="background:#b91c1c;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px;display:inline-block">${esc(t.button)}</a></p>
<p style="margin-bottom:4px">${esc(t.numbers)}</p>
<table style="border-collapse:collapse;font-size:14px">${rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:2px 16px 2px 0;color:#64748b">${esc(label)}</td><td style="padding:2px 0;font-family:monospace;font-weight:bold">${esc(value)}</td></tr>`
    )
    .join("")}</table>
<p>${esc(t.bank)}</p>
<p>${esc(t.questions)}</p>
<p>${esc(t.bye)}<br>Nextview360 ApS</p>
</div>`;

  return { subject: t.subject, bodyText, bodyHtml };
}

const candidateSelect = {
  id: true,
  companyName: true,
  displayName: true,
  cvrNumber: true,
  address: true,
  parentDealId: true,
  contactName: true,
  contactEmail: true,
  invoiceEmail: true,
  contractProducts: true,
  bsCustomerNumber: true,
  bsMandateNumber: true,
  bsMandateStatus: true,
  bsSignupMailSentAt: true,
  parent: {
    select: {
      id: true,
      companyName: true,
      displayName: true,
      cvrNumber: true,
      address: true,
      parentDealId: true,
      bsCustomerNumber: true,
      bsMandateNumber: true,
      bsMandateStatus: true,
      combinedInvoicing: true,
    },
  },
} as const;

/** Customers on Betalingsservice who haven't signed up - main customers
 * only (a branch billed with its parent signs up through it). */
async function notSignedUpCustomers() {
  const deals = await prisma.deal.findMany({
    where: {
      paymentMethod: "BETALINGSSERVICE",
      churnedAt: null,
      stage: { in: [...CUSTOMER_STAGES] },
      // Not just `not: "ACTIVE"` - in SQL that also drops customers with no
      // mandate status at all (NULL), i.e. everyone who never signed up.
      OR: [{ bsMandateStatus: null }, { bsMandateStatus: { not: "ACTIVE" } }],
    },
    select: candidateSelect,
    orderBy: { companyName: "asc" },
  });
  return deals.filter((d) => bsPayerOf(d).id === d.id);
}

export async function signupMailOverview(): Promise<{ unsent: number; withoutEmail: string[] }> {
  const deals = await notSignedUpCustomers();
  const unsent = deals.filter((d) => !d.bsSignupMailSentAt);
  return {
    unsent: unsent.filter((d) => d.invoiceEmail || d.contactEmail).length,
    withoutEmail: unsent.filter((d) => !(d.invoiceEmail || d.contactEmail)).map((d) => dealName(d)),
  };
}

export async function previewSignupMail(): Promise<{ to: string; subject: string; bodyText: string } | { error: string }> {
  const settings = await getBsSettings();
  if (!settings.signupLink) return { error: "Indsæt jeres tilmeldingslink først." };
  if (!settings.pbsNumber || !settings.debtorGroupNumber) return { error: "Udfyld PBS-nr. og debitorgruppe under Aftale først." };
  const deal = (await notSignedUpCustomers()).find((d) => d.invoiceEmail || d.contactEmail);
  const mail = buildSignupMail({
    contactName: deal?.contactName ?? "Hans Hansen",
    customerName: deal ? dealName(deal) : "Eksempel ApS",
    customerNumber: deal?.bsCustomerNumber ?? "NV00000",
    cvrNumber: deal ? deal.cvrNumber : "12345678",
    pbsNumber: settings.pbsNumber,
    debtorGroupNumber: settings.debtorGroupNumber,
    signupLink: settings.signupLink,
    language: parseContractProducts(deal?.contractProducts)?.language === "en" ? "en" : "da",
  });
  return { to: deal ? (deal.invoiceEmail || deal.contactEmail)! : "eksempel@kunde.dk", subject: mail.subject, bodyText: mail.bodyText };
}

/**
 * Sends the sign-up e-mail - to one customer (`dealId`, also when it was
 * sent before), or else to the next batch of customers who haven't had it
 * yet. Batched so each call stays well inside a request's time limit; the
 * caller repeats until `remaining` is 0.
 */
export async function sendSignupMails(dealId?: string): Promise<{
  sent: number;
  failed: { name: string; error: string }[];
  remaining: number;
}> {
  const settings = await getBsSettings();
  if (!settings.signupLink) throw new Error("Indsæt jeres tilmeldingslink først.");
  if (!settings.pbsNumber || !settings.debtorGroupNumber) throw new Error("Udfyld PBS-nr. og debitorgruppe under Aftale først.");
  const account = await prisma.emailAccount.findFirst({ where: { provider: "GOOGLE", email: SIGNUP_MAIL_SENDER } });
  if (!account) throw new Error(`Ingen forbundet Gmail-konto for ${SIGNUP_MAIL_SENDER}. Forbind den under Indstillinger → E-mail.`);

  const all = (await notSignedUpCustomers()).filter((d) => d.invoiceEmail || d.contactEmail);
  const queue = dealId ? all.filter((d) => d.id === dealId) : all.filter((d) => !d.bsSignupMailSentAt);
  if (dealId && queue.length === 0) throw new Error("Kunden er allerede tilmeldt, er ikke på Betalingsservice eller har ingen e-mail.");
  const batch = queue.slice(0, BATCH_SIZE);

  let sent = 0;
  const failed: { name: string; error: string }[] = [];
  for (const deal of batch) {
    try {
      const customerNumber = deal.bsCustomerNumber ?? (await ensureBsCustomerNumber(deal.id));
      const mail = buildSignupMail({
        contactName: deal.contactName,
        customerName: dealName(deal),
        customerNumber,
        cvrNumber: deal.cvrNumber,
        pbsNumber: settings.pbsNumber,
        debtorGroupNumber: settings.debtorGroupNumber,
        signupLink: settings.signupLink,
        language: parseContractProducts(deal.contractProducts)?.language === "en" ? "en" : "da",
      });
      await sendGmailMessage(account, {
        to: [(deal.invoiceEmail || deal.contactEmail)!],
        subject: mail.subject,
        bodyText: mail.bodyText,
        bodyHtml: mail.bodyHtml,
        fromName: "Nextview360 ApS",
      });
      await prisma.deal.update({ where: { id: deal.id }, data: { bsSignupMailSentAt: new Date() } });
      sent++;
    } catch (err) {
      failed.push({ name: dealName(deal), error: err instanceof Error ? err.message : "Ukendt fejl" });
    }
  }
  // Failed ones keep bsSignupMailSentAt empty, so they'd come round again -
  // stop after this batch instead of looping on the same failures.
  const remaining = dealId || failed.length > 0 ? 0 : queue.length - batch.length;
  return { sent, failed, remaining };
}
