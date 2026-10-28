"use server";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettingValue } from "@/lib/integration-settings";
import { claudeCostUsd } from "@/lib/claude-cost";
import { sendGmailMessage } from "@/lib/gmail";
import { logActivity } from "@/lib/activity";
import { sendTemplatedEmailAction } from "@/lib/actions/deal-email";
import { EXAMPLE, MAIL_KINDS, STYLE, describeInput, fillMail, markBlocks, priceBlock, toursBlock, type SalesMailInput } from "@/lib/sales-mail";

/*
 * Salg → Mailgenerator: nextviewAI writes a mail from a few lines (who it's
 * to, what was talked about, the price, tours to show) in the way the team
 * writes. The price and the tour links are put in by Arpo, never by the
 * model. Every mail the seller sends (or copies) is kept - as the seller
 * left it - and the latest ones are the examples next time, so it learns
 * the team's way of writing and what they correct.
 */

const Draft = z.object({ subject: z.string(), body: z.string() });

export type DraftResult = { ok: true; id: string; subject: string; body: string } | { ok: false; error: string };

const cap = (s: unknown, n: number) => (typeof s === "string" ? s.slice(0, n) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 100_000_000 ? Math.round(v) : null);

/** Only what the form can send - anything else is dropped, everything is capped. */
function clean(raw: SalesMailInput): SalesMailInput {
  const kind = raw.kind in MAIL_KINDS ? raw.kind : "andet";
  const p = raw.price;
  return {
    kind,
    dealId: typeof raw.dealId === "string" && raw.dealId ? raw.dealId : null,
    name: cap(raw.name, 120),
    company: cap(raw.company, 160),
    industry: cap(raw.industry, 80),
    notes: cap(raw.notes, 4000),
    colleagues: cap(raw.colleagues, 120),
    delivery: cap(raw.delivery, 120),
    price: p ? { establishment: num(p.establishment), monthly: num(p.monthly), locations: num(p.locations), bindingMonths: num(p.bindingMonths), conditions: cap(p.conditions, 400) } : null,
    tours: (Array.isArray(raw.tours) ? raw.tours : [])
      .slice(0, 5)
      .map((t) => ({ name: cap(t?.name, 120), url: cap(t?.url, 400) }))
      .filter((t) => t.name && /^https:\/\//i.test(t.url)),
  };
}

/** The team's latest sent mails - the seller's own and the same kind/industry first - with what nextviewAI had suggested. */
async function examples(userId: string, i: SalesMailInput) {
  const rows = await prisma.salesMail.findMany({
    where: { finalAt: { not: null } },
    orderBy: { finalAt: "desc" },
    take: 60,
    select: { userId: true, kind: true, industry: true, input: true, draft: true, finalSubject: true, finalBody: true },
  });
  const score = (r: (typeof rows)[number]) => (r.userId === userId ? 2 : 0) + (r.kind === i.kind ? 1 : 0) + (i.industry && r.industry === i.industry ? 1 : 0);
  return rows
    .map((r, n) => ({ r, s: score(r) - n * 0.01 }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 5)
    .map(({ r }) => {
      const notes = (r.input as { notes?: string } | null)?.notes ?? "";
      const changed = r.draft.trim() !== (r.finalBody ?? "").trim();
      return [
        `<eksempel>`,
        `Noter: ${notes.slice(0, 1200)}`,
        changed ? `nextviewAI foreslog:\n${r.draft.slice(0, 2500)}\n\nSælgeren rettede og sendte:` : "Sendt sådan:",
        `Emne: ${r.finalSubject}\n${(r.finalBody ?? "").slice(0, 2500)}`,
        `</eksempel>`,
      ].join("\n");
    });
}

/**
 * A draft - or, with `revise`, the current text made over as asked
 * ("kortere", "mere formel" …), with the price and links kept as they are.
 */
export async function draftSalesMail(raw: SalesMailInput, revise?: { subject: string; body: string; ask: string }): Promise<DraftResult> {
  const user = await requireUser();
  const key = process.env.ANTHROPIC_API_KEY || (await getSettingValue("ANTHROPIC_API_KEY"));
  if (!key) return { ok: false, error: "nextviewAI er ikke sat op endnu - en admin indsætter nøglen i tour-editoren under fanen nextviewAI." };
  const i = clean(raw);
  if (!i.notes.trim() && !revise) return { ok: false, error: "Skriv et par linjer om, hvad mailen skal handle om." };
  if (i.dealId && !(await prisma.deal.findUnique({ where: { id: i.dealId }, select: { id: true } }))) return { ok: false, error: "Dealen findes ikke." };

  const price = priceBlock(i.price);
  const tours = toursBlock(i.tours);
  const sellerName = [user.name, user.lastName].filter(Boolean).join(" ");
  const learned = await examples(user.id, i);
  const system = [
    STYLE,
    `Et eksempel på en god mail fra teamet (navne ændret).\nNoter: ${EXAMPLE.notes}\nMail:\n${EXAMPLE.body}`,
    learned.length
      ? `Teamets seneste mails, som de faktisk blev sendt - skriv som dem. Hvor sælgeren har rettet i forslaget, så lær af rettelserne:\n\n${learned.join("\n\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");
  const ask = revise
    ? `${describeInput(i, sellerName)}\n\nDen nuværende mail:\nEmne: ${cap(revise.subject, 300)}\n${markBlocks(cap(revise.body, 6000), price, tours)}\n\nLav mailen om sådan her (data fra sælgeren): <ønske>${cap(revise.ask, 500)}</ønske>\nBehold {{pris}} og {{tours}} som de står.`
    : `${describeInput(i, sellerName)}\n\nSkriv mailen.`;

  const client = new Anthropic({ apiKey: key });
  let r;
  try {
    r = await client.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 3000,
      system,
      messages: [{ role: "user", content: ask }],
      output_config: { effort: "medium", format: zodOutputFormat(Draft) },
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return { ok: false, error: "nextviewAI-nøglen virker ikke længere." };
    return { ok: false, error: `Kunne ikke få fat i nextviewAI (${err instanceof Error ? err.message : err}).` };
  }
  const u = r.usage;
  await prisma.tourAiUsage
    .create({ data: { tourSlug: "_mailgenerator", userName: user.name, kind: "mailgenerator", inputTokens: u.input_tokens, outputTokens: u.output_tokens, cacheReadTokens: u.cache_read_input_tokens ?? 0, cacheWriteTokens: u.cache_creation_input_tokens ?? 0, costUsd: claudeCostUsd(u) } })
    .catch(() => {});
  const out = r.parsed_output;
  if (!out) return { ok: false, error: "nextviewAI svarede ikke som forventet - prøv igen." };

  const subject = out.subject.replace(/^(re|sv):\s*/i, "").trim().slice(0, 200);
  const body = fillMail(out.body, price, tours);
  const row = await prisma.salesMail.create({
    data: { userId: user.id, userName: user.name, dealId: i.dealId, kind: i.kind, industry: i.industry || null, input: i, subject, draft: body },
  });
  return { ok: true, id: row.id, subject, body };
}

async function ownDraft(id: string) {
  const user = await requireUser();
  const row = await prisma.salesMail.findUnique({ where: { id } });
  if (!row || (row.userId !== user.id && user.role !== "ADMIN")) return null;
  return { user, row };
}

/** Kept as the seller left it - "kopieret" (they send it themselves) or "sendt". */
async function remember(id: string, subject: string, body: string, how: "sendt" | "kopieret") {
  await prisma.salesMail.update({ where: { id }, data: { finalSubject: cap(subject, 300), finalBody: cap(body, 10_000), finalHow: how, finalAt: new Date() } });
}

/** "Kopiér": the seller sends it from their own mail program - kept all the same, so it's learned from. */
export async function copiedSalesMail(id: string, subject: string, body: string): Promise<{ ok: boolean }> {
  const own = await ownDraft(id);
  if (!own) return { ok: false };
  await remember(id, subject, body, "kopieret");
  return { ok: true };
}

const EMAIL_RE = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;

/**
 * "Send" from the seller's own Gmail: with a deal, the deal's own mail flow
 * (to its contact, logged on the deal, follow-up task); without, to the
 * address typed in.
 */
export async function sendSalesMail(id: string, to: string, subject: string, body: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const own = await ownDraft(id);
  if (!own) return { ok: false, error: "Mailen findes ikke." };
  const { user, row } = own;
  const s = cap(subject, 300).trim();
  const b = cap(body, 10_000).trim();
  if (!s || !b) return { ok: false, error: "Mailen mangler emne eller tekst." };

  if (row.dealId) {
    const r = await sendTemplatedEmailAction(row.dealId, s, b);
    if (!r.ok) return r;
    await remember(id, s, b, "sendt");
    return { ok: true };
  }

  const address = to.trim();
  if (!EMAIL_RE.test(address)) return { ok: false, error: "Skriv en gyldig e-mail at sende til." };
  const account = await prisma.emailAccount.findFirst({ where: { userId: user.id, provider: "GOOGLE" } });
  if (!account) return { ok: false, error: "Forbind din Gmail-konto under Indstillinger → E-mail for at kunne sende herfra." };

  const sellerName = [user.name, user.lastName].filter(Boolean).join(" ");
  const sig = [sellerName, "Nextview360", user.phone ? `Tlf: ${user.phone}` : null].filter((l): l is string => Boolean(l));
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = esc(b)
    .replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${url}">${url}</a>`)
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  const signatureHtml = `<p>Med venlig hilsen<br><b>${esc(sellerName)}</b>${sig.slice(1).map((l) => `<br>${esc(l)}`).join("")}</p>`;
  try {
    await sendGmailMessage(account, {
      to: [address],
      subject: s,
      bodyText: `${b}\n\nMed venlig hilsen\n${sig.join("\n")}`,
      bodyHtml: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">${html}${signatureHtml}</div>`,
      fromName: sellerName,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Kunne ikke sende e-mailen." };
  }
  await remember(id, s, b, "sendt");
  await logActivity({ type: "EMAIL_SENT", message: `${user.name} sendte en mail fra mailgeneratoren til ${(row.input as { company?: string; name?: string } | null)?.company || (row.input as { name?: string } | null)?.name || address}`, actorId: user.id });
  return { ok: true };
}
