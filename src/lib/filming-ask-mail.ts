import "server-only";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { dealName } from "@/lib/labels";
import { parseContractProducts } from "@/lib/contract-template-data";
import { resendReady, sendSystemMail } from "@/lib/system-mail";
import { WELCOME_MAIL_SENDER } from "@/lib/welcome-mail";

/*
 * 24 hours after a contract is signed: a mail from Lasse asking for 3 dates
 * to film (weekends and holidays too), with what to get ready - so the
 * filming is in the calendar at once. Sent once per deal (kept as a
 * SystemMail "filming_ask"), never when a filming is already booked, the
 * deal is lost, or it has no contact e-mail. Text approved by Lasse.
 */

const KIND = "filming_ask";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const TEXT = {
  da: {
    subject: "Tak fordi I er blevet kunde - hvornår må vi komme og optage?",
    hello: (n: string | null) => (n ? `Hej ${n},` : "Hej,"),
    thanks: "Tusind tak, fordi I har valgt at blive kunde hos Nextview360. Vi glæder os rigtig meget til at komme i gang og til at lave en tour, I bliver stolte af.",
    soon: "Vi vil gerne optage jer så hurtigt som muligt, så touren kan komme ud og leve og begynde at skabe værdi for jer. Derfor vil vi gerne have en dato i kalenderen med det samme.",
    ask: ["Svar på denne mail med ", "3 forslag til tidspunkter", ", der passer jer. Det må gerne være på hverdage, i weekender og på helligdage. Vi finder et af dem, der passer os, og sender en invitation i kalenderen."],
    readyIntro: "Så optagelsen bliver så flot som muligt, beder vi jer sørge for, at:",
    ready: [
      "der er pænt og ryddet op i alle rum, der skal optages (også gange, toiletter og fællesarealer)",
      "løse ting som papirer, kabler, tasker, overtøj og affald er fjernet fra borde, gulve og vindueskarme",
      "alle døre og rum, vi skal ind i, er låst op og tilgængelige",
      "lyset er tændt og gardiner/persienner trukket op",
      "der helst ikke er personer i rummene, mens vi optager dem",
      "der er en kontaktperson til stede, som kan vise os rundt og svare på spørgsmål",
    ],
    questions: "Har I spørgsmål, er I altid velkomne til at skrive eller ringe.",
    regards: "Med venlig hilsen",
    auto: "Denne mail er sendt automatisk, efter at aftalen blev underskrevet. Men I skriver direkte til mig, når I svarer, og jeg læser selvfølgelig jeres svar. Har vi allerede aftalt en dato med jer, kan I se bort fra mailen.",
  },
  en: {
    subject: "Thank you for becoming a customer - when can we come and film?",
    hello: (n: string | null) => (n ? `Hi ${n},` : "Hi,"),
    thanks: "Thank you so much for choosing to become a customer of Nextview360. We are really looking forward to getting started and to making a tour you'll be proud of.",
    soon: "We'd like to film as soon as possible, so the tour can get out there and start creating value for you. That's why we'd like to get a date in the calendar right away.",
    ask: ["Reply to this e-mail with ", "3 suggested times", " that suit you. Weekdays, weekends and public holidays are all fine. We'll pick one that suits us and send you a calendar invitation."],
    readyIntro: "To make the filming as good as possible, please make sure that:",
    ready: [
      "all rooms to be filmed are tidy (corridors, toilets and shared areas too)",
      "loose things like papers, cables, bags, coats and rubbish are cleared from tables, floors and window sills",
      "all doors and rooms we need to get into are unlocked and accessible",
      "the lights are on and curtains/blinds are open",
      "preferably no one is in the rooms while we film them",
      "a contact person is there to show us around and answer questions",
    ],
    questions: "If you have any questions, you're always welcome to write or call.",
    regards: "Best regards",
    auto: "This e-mail was sent automatically after the agreement was signed. But when you reply, it comes straight to me, and of course I read your reply. If we've already agreed on a date with you, please disregard this e-mail.",
  },
};
const SIGNATURE = ["Lasse Larsen", "Nextview360", "Tlf: 23 27 07 86"];

export function buildFilmingAskMail(input: { contactName: string | null; language: "da" | "en" }) {
  const t = TEXT[input.language];
  const first = input.contactName?.trim().split(/\s+/)[0] || null;
  const bodyText = [
    t.hello(first),
    "",
    t.thanks,
    "",
    t.soon,
    "",
    t.ask.join(""),
    "",
    t.readyIntro,
    ...t.ready.map((r) => `• ${r}`),
    "",
    t.questions,
    "",
    t.regards,
    ...SIGNATURE,
    "",
    t.auto,
  ].join("\n");
  const p = (s: string) => `<p style="margin:0 0 14px">${s}</p>`;
  const bodyHtml = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#1d2a30;max-width:600px">
${p(esc(t.hello(first)))}
${p(esc(t.thanks))}
${p(esc(t.soon))}
${p(`${esc(t.ask[0])}<b>${esc(t.ask[1])}</b>${esc(t.ask[2])}`)}
<p style="margin:0 0 6px">${esc(t.readyIntro)}</p>
<ul style="margin:0 0 14px;padding-left:20px">${t.ready.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>
${p(esc(t.questions))}
<p style="margin:0 0 18px">${esc(t.regards)}<br>${SIGNATURE.map(esc).join("<br>")}</p>
<p style="margin:0;font-size:12.5px;color:#7a8a90"><i>${esc(t.auto)}</i></p>
</div>`;
  return { subject: t.subject, bodyText, bodyHtml };
}

/** The deals due: signed 24 hours ago or more (within 14 days), no filming booked, not lost, not sent before. */
async function dueDeals(now = new Date()) {
  return prisma.deal.findMany({
    where: {
      contractSignedAt: { lte: new Date(now.getTime() - 24 * 3600_000), gte: new Date(now.getTime() - 14 * 86_400_000) },
      filmingAt: null,
      filmedAt: null,
      stage: { notIn: ["LOST", "FILMING_BOOKED", "FILMED", "REVIEW", "LIVE"] },
      churnedAt: null,
      contactEmail: { not: null },
      // Not sent before (a failed try may be tried again - at most 3 times).
      systemMails: { none: { kind: KIND, error: null } },
    },
    select: { id: true, ownerId: true, companyName: true, displayName: true, contactEmail: true, contactName: true, contractProducts: true },
    take: 20,
  });
}

/** Sends the mails that are due. Returns how many went out. */
export async function sendDueFilmingAsks(): Promise<number> {
  const deals = await dueDeals();
  if (!deals.length) return 0;
  const account = await prisma.emailAccount.findFirst({ where: { provider: "GOOGLE", email: WELCOME_MAIL_SENDER } });
  if (!account && !resendReady()) return 0;
  let sent = 0;
  for (const d of deals) {
    const to = d.contactEmail!.trim();
    if (!EMAIL.test(to)) continue;
    // Claimed first (a row of its own), so two runs at once never send it twice.
    const mail = buildFilmingAskMail({ contactName: d.contactName, language: parseContractProducts(d.contractProducts)?.language === "en" ? "en" : "da" });
    const row = await prisma.systemMail.create({ data: { dealId: d.id, kind: KIND, to, subject: mail.subject } });
    const [others, failed] = await Promise.all([
      prisma.systemMail.count({ where: { dealId: d.id, kind: KIND, error: null, id: { not: row.id }, sentAt: { lte: row.sentAt } } }),
      prisma.systemMail.count({ where: { dealId: d.id, kind: KIND, error: { not: null } } }),
    ]);
    if (others || failed >= 3) {
      await prisma.systemMail.delete({ where: { id: row.id } }).catch(() => {});
      continue;
    }
    try {
      await sendSystemMail(account, { to: [to], subject: mail.subject, bodyText: mail.bodyText, bodyHtml: mail.bodyHtml, fromName: "Lasse - Nextview360", fromAddress: WELCOME_MAIL_SENDER, replyTo: WELCOME_MAIL_SENDER });
    } catch (err) {
      await prisma.systemMail.update({ where: { id: row.id }, data: { error: (err instanceof Error ? err.message : String(err)).slice(0, 300) } }).catch(() => {});
      continue;
    }
    await prisma.note.create({ data: { dealId: d.id, authorId: d.ownerId, kind: "MANUAL", body: `Automatisk mail sendt til ${to}: beder om 3 forslag til en dato for optagelsen.` } }).catch(() => {});
    await logActivity({ type: "DEAL_UPDATED", message: `Mail om dato for optagelse sendt til ${to}: ${dealName(d)}`, dealId: d.id }).catch(() => {});
    sent++;
  }
  return sent;
}

/** Called while the team uses Arpo (at most every 15 minutes) - so it goes out close to the 24 hours, not only with the daily run. */
export async function sendFilmingAsksIfDue(): Promise<void> {
  try {
    const key = "FILMING_ASK_AT";
    await prisma.integrationSetting.upsert({ where: { key }, create: { key, value: "0", updatedAt: new Date(0) }, update: {} });
    const claimed = await prisma.integrationSetting.updateMany({ where: { key, updatedAt: { lt: new Date(Date.now() - 15 * 60_000) } }, data: { value: new Date().toISOString() } });
    if (claimed.count !== 1) return;
    await sendDueFilmingAsks();
  } catch (err) {
    console.error("Mail om dato for optagelse:", err);
  }
}
