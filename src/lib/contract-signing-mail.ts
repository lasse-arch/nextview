import "server-only";
import { prisma } from "@/lib/db";
import { mailSignOff, sendGmailMessage } from "@/lib/gmail";
import { sendDealEmail, type Sender } from "@/lib/deal-email-send";
import { customerSigningLink, resendCustomerSigningMail } from "@/lib/docuseal";

/*
 * The contract's signing mail from the seller's own Gmail (not DocuSeal's
 * info@docuseal.com): the customer gets it from the person they've talked
 * to, answers go straight to them, and with a deal it's kept on the deal.
 * The link is the customer's own signing page in DocuSeal (on
 * sign.nextview360.dk). If the seller has no Gmail connected, or the mail
 * doesn't go, DocuSeal sends its own instead - the customer always gets it.
 * Text approved 2026-11-13.
 */

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function signingMail(lang: "da" | "en", contactName: string | null, link: string, phone: string | null): { subject: string; html: string } {
  const first = (contactName ?? "").trim().split(/\s+/)[0] ?? "";
  const button = (label: string) =>
    `<p style="margin:18px 0"><a href="${esc(link)}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:#1d4ed8;color:#ffffff;font-weight:bold;text-decoration:none">${label}</a></p>`;
  if (lang === "en")
    return {
      subject: "Contract from Nextview360 for signing",
      html: `<p>Hi${first ? ` ${esc(first)}` : ""}</p><p>As agreed, here is the contract for our collaboration. You can read and sign it here:</p>${button("Read and sign")}<p>It takes a couple of minutes, and you can sign on both phone and computer. If you have any questions, just reply to this email${phone ? ` or call me on ${esc(phone)}` : ""}.</p><p style="font-size:12px;color:#6b7280">If the button doesn't work, use this link: <a href="${esc(link)}">${esc(link)}</a></p>`,
    };
  return {
    subject: "Kontrakt fra Nextview360 til underskrift",
    html: `<p>Hej${first ? ` ${esc(first)}` : ""}</p><p>Som aftalt sender jeg hermed kontrakten for vores samarbejde. Du kan læse og skrive under her:</p>${button("Læs og skriv under")}<p>Det tager et par minutter, og du kan skrive under på både telefon og computer. Har du spørgsmål, så svar bare på denne mail${phone ? ` eller ring til mig på ${esc(phone)}` : ""}.</p><p style="font-size:12px;color:#6b7280">Virker knappen ikke, så brug dette link: <a href="${esc(link)}">${esc(link)}</a></p>`,
  };
}

/** Can this seller send it themselves (a Gmail connected in Arpo)? Then DocuSeal is told not to mail the customer. */
export async function sendsOwnSigningMail(userId: string): Promise<boolean> {
  return Boolean(await prisma.emailAccount.findFirst({ where: { userId, provider: "GOOGLE" }, select: { id: true } }));
}

/**
 * Sends the signing mail from the seller's Gmail - with a deal through the deal's own mail flow (logged there), without
 * one straight to the address. Falls back to DocuSeal's own mail when it can't; `warning` then says so.
 */
export async function sendSigningMail(opts: {
  sender: Sender;
  submissionId: string;
  to: string;
  contactName: string | null;
  lang: "da" | "en";
  dealId?: string;
}): Promise<{ via: "gmail" | "docuseal"; warning?: string }> {
  const fallback = async (why: string) => {
    await resendCustomerSigningMail(opts.submissionId);
    return { via: "docuseal" as const, warning: `Mailen fra din Gmail kom ikke af sted (${why}) - DocuSeal har sendt den i stedet.` };
  };
  const link = await customerSigningLink(opts.submissionId).catch(() => null);
  if (!link) return fallback("DocuSeal gav ikke noget link til kunden");
  const { subject, html } = signingMail(opts.lang, opts.contactName, link, opts.sender.phone);
  if (opts.dealId) {
    const r = await sendDealEmail(opts.sender, opts.dealId, subject, html, [], [], undefined, opts.to, [], undefined, { followUpTask: false, lang: opts.lang }).catch((err: unknown) => ({
      ok: false as const,
      error: err instanceof Error ? err.message : String(err),
    }));
    return r.ok ? { via: "gmail" } : fallback(r.error);
  }
  const account = await prisma.emailAccount.findFirst({ where: { userId: opts.sender.id, provider: "GOOGLE" } });
  if (!account) return fallback("ingen Gmail forbundet");
  const sellerName = [opts.sender.name, opts.sender.lastName].filter(Boolean).join(" ");
  const regards = opts.lang === "en" ? "Best regards" : "Med venlig hilsen";
  const lines = [sellerName, "Nextview360", opts.sender.phone ? `Tlf: ${opts.sender.phone}` : null].filter((l): l is string => Boolean(l));
  const signOff = await mailSignOff(account, { text: `\n\n${regards}\n${lines.join("\n")}`, html: `<p>${regards}<br><b>${esc(sellerName)}</b>${lines.slice(1).map((l) => `<br>${esc(l)}`).join("")}</p>` });
  try {
    await sendGmailMessage(account, {
      to: [opts.to],
      subject,
      bodyText: `${html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}${signOff.text}`,
      bodyHtml: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">${html}${signOff.html}</div>`,
      fromName: sellerName,
    });
    return { via: "gmail" };
  } catch (err) {
    return fallback(err instanceof Error ? err.message : "Gmail svarede ikke");
  }
}
