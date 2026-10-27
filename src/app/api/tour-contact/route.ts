import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { sendGmailMessage } from "@/lib/gmail";
import { WELCOME_MAIL_SENDER } from "@/lib/welcome-mail";
import type { TourConfig } from "@/app/arpo/tour-lab/tours/types";

/*
 * A tour's contact form ("Skriv til os"). Public - anyone looking at a tour can
 * write - so: the recipient is the tour's own setting (never from the form),
 * every message is kept, a hidden field catches bots, and one sender may send
 * a few an hour, one tour a handful a day. Answered with CORS for any origin
 * (the tours on tour.nextview360.dk post here); no cookies are involved.
 */

const PER_SENDER_HOUR = 5;
const PER_TOUR_DAY = 60;
const EMAIL = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type" };

const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: CORS });
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (raw.length > 12_000) return reply({ error: "For lang besked." }, 413);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return reply({ error: "Ugyldig besked." }, 400);
  }
  const slug = text(body.tour, 80);
  const name = text(body.name, 100);
  const email = text(body.email, 200).toLowerCase();
  const phone = text(body.phone, 40) || null;
  const message = text(body.message, 4000);
  // The hidden field people never see - a bot fills it in. Answered as if sent, so it learns nothing.
  if (text(body.website, 200)) return reply({ ok: true });
  if (!name || !EMAIL.test(email) || !message) return reply({ error: "Udfyld navn, e-mail og besked." }, 400);

  const tour = await prisma.tour.findUnique({ where: { slug }, select: { slug: true, name: true, published: true, liveVersion: true, config: true } });
  const form = (tour?.config as unknown as TourConfig | undefined)?.contactForm;
  if (!tour || (!tour.published && tour.liveVersion == null) || !form?.to || !EMAIL.test(form.to)) return reply({ error: "Formularen virker ikke lige nu." }, 404);

  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "ukendt";
  const ipHash = createHash("sha256").update(`${process.env.AUTH_SECRET ?? ""}:${ip}`).digest("hex").slice(0, 32);
  const [bySender, byTour] = await Promise.all([
    prisma.tourMessage.count({ where: { ipHash, createdAt: { gt: new Date(Date.now() - 3600_000) } } }),
    prisma.tourMessage.count({ where: { tourSlug: slug, createdAt: { gt: new Date(Date.now() - 86_400_000) } } }),
  ]);
  if (bySender >= PER_SENDER_HOUR || byTour >= PER_TOUR_DAY) return reply({ error: "Der er sendt mange beskeder lige nu - prøv igen senere, eller ring." }, 429);

  const row = await prisma.tourMessage.create({ data: { tourSlug: slug, name, email, phone, message, ipHash } });
  const title = (tour.config as unknown as TourConfig).title || tour.name;
  try {
    const account = await prisma.emailAccount.findFirst({ where: { provider: "GOOGLE", email: WELCOME_MAIL_SENDER } });
    if (!account) throw new Error("Ingen forbundet Gmail-konto");
    const lines: [string, string][] = [
      ["Navn", name],
      ["E-mail", email],
      ...(phone ? ([["Telefon", phone]] as [string, string][]) : []),
    ];
    await sendGmailMessage(account, {
      to: [form.to],
      subject: `Ny besked fra jeres virtuelle tour - ${name}`,
      bodyText: `${lines.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${message}\n\n--\nSendt fra kontaktformularen i ${title}. Svar direkte på denne mail for at skrive til ${name}.`,
      bodyHtml: `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1d1d1f;max-width:560px">
<p style="margin:0 0 12px;font-size:13px;color:#6e6e73">Ny besked fra kontaktformularen i <b>${esc(title)}</b></p>
<table style="border-collapse:collapse;margin:0 0 14px">${lines.map(([k, v]) => `<tr><td style="padding:3px 14px 3px 0;color:#6e6e73">${k}</td><td style="padding:3px 0"><b>${esc(v)}</b></td></tr>`).join("")}</table>
<div style="white-space:pre-wrap;background:#f5f5f7;border-radius:12px;padding:14px 16px">${esc(message)}</div>
<p style="margin:14px 0 0;font-size:13px;color:#6e6e73">Svar direkte på denne mail for at skrive til ${esc(name)}.</p>
</div>`,
      fromName: `${title} via Nextview360`,
      fromAddress: "info@nextview360.dk",
      replyTo: email,
    });
    await prisma.tourMessage.update({ where: { id: row.id }, data: { sent: true } });
  } catch (err) {
    // Kept anyway - it can be found in Arpo and passed on by hand.
    await prisma.tourMessage.update({ where: { id: row.id }, data: { error: (err instanceof Error ? err.message : String(err)).slice(0, 300) } });
    console.error("tour-contact", err);
  }
  return reply({ ok: true });
}
