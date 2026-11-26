import "server-only";
import { prisma } from "@/lib/db";
import { getAppBaseUrl } from "@/lib/email-oauth";
import { LOGIN_LINK_FROM, LOGIN_MAIL_FROM } from "@/lib/customer-login";
import { resendReady, sendSystemMail } from "@/lib/system-mail";
import { FILMING_TEXTS_APPROVED, formatFilmingDate, joinNames } from "@/lib/filming";
import { dealName } from "@/lib/labels";

/*
 * "Du er booket til en filmning": a mail to each filmer put on a filming (besides the calendar invitation) - when and
 * where to be, what to film, who to meet and their phone, the others going, what was agreed with the customer, the
 * estimated hours and what that comes to in pay. Waits for the text's approval (FILMING_TEXTS_APPROVED).
 * Never stops a booking: a failure is only logged.
 */

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const kr = (n: number) => n.toLocaleString("da-DK", { maximumFractionDigits: 0 });
const hoursText = (m: number) => {
  const h = m / 60;
  return `${h.toLocaleString("da-DK", { maximumFractionDigits: 1 })} ${h === 1 ? "time" : "timer"}`;
};

export type CrewMailInput = { dealId: string; kind: "Optagelse" | "Genoptagelse"; start: Date; durationMinutes: number; crewIds: string[]; bookerId: string; drone: boolean | null; brief: string | null };

/** The mail's words for one filmer (also for showing the text before it's approved). */
export function crewMailText(x: {
  firstName: string;
  kind: "Optagelse" | "Genoptagelse";
  start: Date;
  durationMinutes: number;
  customer: string;
  address: string | null;
  contactName: string | null;
  contactPhone: string | null;
  others: string[];
  drone: boolean | null;
  brief: string | null;
  pay: { hourlyKr: number } | "monthly" | null;
  link: string;
}) {
  const { date, time } = formatFilmingDate(x.start);
  const task = `${x.kind === "Genoptagelse" ? "Du skal optage dele af en virtuel tour igen" : "Du skal filme en virtuel tour"}${x.drone == null ? "" : x.drone ? ", med drone" : ", uden drone"}.`;
  const payLine =
    x.pay === "monthly"
      ? "Opgaven er en del af din månedsløn."
      : x.pay
        ? `Med din timeløn på ${kr(x.pay.hourlyKr)} kr. kan du forvente ca. ${kr((x.pay.hourlyKr * x.durationMinutes) / 60)} kr. før skat for opgaven. Det endelige beløb afhænger af de timer, du registrerer i Arpo.`
        : "";
  const facts: [string, string][] = [
    ["Hvornår", `${date} kl. ${time} - mød op til tiden`],
    ...(x.address ? ([["Hvor", x.address]] as [string, string][]) : []),
    ["Kunde", x.customer],
    ...(x.contactName || x.contactPhone ? ([["Kontakt på stedet", [x.contactName, x.contactPhone ? `tlf. ${x.contactPhone}` : ""].filter(Boolean).join(", ")]] as [string, string][]) : []),
    ...(x.others.length ? ([["Sammen med", joinNames(x.others)]] as [string, string][]) : []),
  ];
  const subject = `Du er booket til en ${x.kind === "Genoptagelse" ? "genoptagelse" : "filmning"} ${date}`;
  const lines = [
    `Hej ${x.firstName}`,
    `Du er booket til en ${x.kind === "Genoptagelse" ? "genoptagelse" : "filmning"}, og den er lagt i din kalender.`,
    facts.map(([k, v]) => `${k}: ${v}`).join("\n"),
    task,
    `Vi har estimeret, at opgaven tager ca. ${hoursText(x.durationMinutes)}.${payLine ? ` ${payLine}` : ""} Kørsel i egen bil godtgøres med kørepenge, når du registrerer den i Arpo.`,
    x.brief?.trim() ? `Det er aftalt med kunden:\n${x.brief.trim()}` : "",
    `Se alle detaljer under Filmninger i Arpo:\n${x.link}`,
  ].filter(Boolean);
  const bodyText = `${lines.join("\n\n")}\n\nGod fornøjelse!\nNextview360`;
  const bodyHtml = `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1d1d1f;max-width:560px">
<p>${esc(`Hej ${x.firstName}`)}</p>
<p>${esc(lines[1])}</p>
<table style="border-collapse:collapse;margin:0 0 14px">${facts.map(([k, v]) => `<tr><td style="padding:3px 14px 3px 0;color:#6e6e73;vertical-align:top">${esc(k)}</td><td style="padding:3px 0;font-weight:600">${esc(v)}</td></tr>`).join("")}</table>
<p>${esc(task)}</p>
<p>${esc(lines[4])}</p>
${x.brief?.trim() ? `<p style="background:#f5f5f7;border-radius:10px;padding:10px 12px;white-space:pre-line"><b>Det er aftalt med kunden:</b><br>${esc(x.brief.trim())}</p>` : ""}
<p><a href="${esc(x.link)}" style="display:inline-block;background:#0071e3;color:#fff;text-decoration:none;font-weight:600;padding:11px 20px;border-radius:12px">Se opgaven i Arpo</a></p>
<p>God fornøjelse!<br>Nextview360</p>
</div>`;
  return { subject, bodyText, bodyHtml };
}

export async function sendCrewBookingMails(input: CrewMailInput): Promise<void> {
  if (!FILMING_TEXTS_APPROVED) return;
  try {
    const deal = await prisma.deal.findUniqueOrThrow({ where: { id: input.dealId }, select: { companyName: true, displayName: true, address: true, contactName: true, contactPhone: true } });
    const crew = await prisma.user.findMany({
      where: { id: { in: input.crewIds } },
      select: { id: true, name: true, lastName: true, email: true, employee: { select: { pay: { where: { effectiveFrom: { lte: input.start } }, orderBy: { effectiveFrom: "desc" }, take: 1 } } } },
    });
    const sender = await prisma.emailAccount.findFirst({ where: { provider: "GOOGLE", email: LOGIN_MAIL_FROM } });
    if (!sender && !resendReady()) return console.error("[filming] ingen mail-afsender til crew-mailen");
    for (const c of crew) {
      if (c.id === input.bookerId) continue; // the one who booked it knows
      const p = c.employee?.pay[0];
      const pay = p?.model === "HOURLY" && p.hourlyOre ? { hourlyKr: p.hourlyOre / 100 } : p && (p.model === "MONTHLY" || p.model === "MONTHLY_COMMISSION") ? ("monthly" as const) : null;
      const mail = crewMailText({
        firstName: c.name,
        kind: input.kind,
        start: input.start,
        durationMinutes: input.durationMinutes,
        customer: dealName(deal),
        address: deal.address,
        contactName: deal.contactName,
        contactPhone: deal.contactPhone,
        others: crew.filter((o) => o.id !== c.id).map((o) => o.name),
        drone: input.drone,
        brief: input.brief,
        pay,
        link: `${getAppBaseUrl()}/arpo/filmninger`,
      });
      await sendSystemMail(sender, { to: [c.email], ...mail, fromName: "Nextview360", fromAddress: LOGIN_LINK_FROM, gmailFromAddress: LOGIN_MAIL_FROM, replyTo: LOGIN_MAIL_FROM }).catch((err) =>
        console.error("[filming] crew-mail fejlede", err instanceof Error ? err.message : err)
      );
    }
  } catch (err) {
    console.error("[filming] crew-mails fejlede", err instanceof Error ? err.message : err);
  }
}
