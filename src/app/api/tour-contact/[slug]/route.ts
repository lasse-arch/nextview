import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { tourCors } from "@/lib/tour-cors";
import { sendSystemMail } from "@/lib/system-mail";
import type { TourConfig } from "@/app/arpo/tour-lab/tours/types";

/*
 * "Skriv til os" in a tour, sent by us: from kontaktformular@nextview360.dk to
 * the address set on the tour (never one the visitor sends), with the
 * visitor's e-mail as Reply-To - so the customer just presses Reply. Nothing
 * is kept: the message only exists in the customer's inbox.
 *
 * Public (the tour is), so it is guarded without slowing anyone down - all on
 * our side, no captcha to load or solve:
 * - a hidden field only robots fill in, and a form sent faster than a person
 *   can write one, are thanked and dropped (a robot learns nothing);
 * - at most 2 messages per visitor per half hour, 30 per tour an hour;
 * - lengths are limited, links are few, and the text is sent as plain text.
 * The visitor gets no copy, so it can't be used to send mail to others.
 */

const EMAIL = /^[^\s@<>",;?&]+@[^\s@<>",;?&]+\.[^\s@<>",;?&]+$/;
/** Messages sent - only those that went out count (a typo in a field doesn't use up a visitor's turn). */
const sent = new Map<string, number[]>();
function used(key: string, ms: number): number {
  const now = Date.now();
  const list = (sent.get(key) ?? []).filter((t) => now - t < ms);
  sent.set(key, list);
  return list.length;
}
function count(...keys: string[]) {
  if (sent.size > 20_000) sent.clear();
  for (const k of keys) sent.set(k, [...(sent.get(k) ?? []), Date.now()]);
}
/** At most 2 messages per visitor per half hour, and 30 per tour an hour. */
const PER_VISITOR = { max: 2, ms: 1_800_000 };
const PER_TOUR = { max: 30, ms: 3_600_000 };
// Attempts of any kind (robots hammering the address), per visitor - far above what a person does.
const tries = new Map<string, number[]>();
function hammering(ip: string): boolean {
  const now = Date.now();
  const list = (tries.get(ip) ?? []).filter((t) => now - t < 600_000);
  if (tries.size > 20_000) tries.clear();
  tries.set(ip, [...list, now]);
  return list.length >= 20;
}

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max) : "");

export function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: tourCors(request, { "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "content-type", "Access-Control-Max-Age": "86400" }) });
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const headers = tourCors(request);
  const ok = () => NextResponse.json({ ok: true }, { headers });
  const fail = (error: string, status = 400) => NextResponse.json({ error }, { status, headers });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return fail("Beskeden kunne ikke læses.");

  // Robots: the hidden field is filled in, or the form was "written" in under 3 seconds. Thanked - and dropped.
  if (clean(body.website, 200) || (typeof body.ms === "number" && body.ms < 3000)) return ok();

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "ukendt";
  const slug = (await params).slug;
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return fail("Touren findes ikke.", 404);
  if (hammering(ip) || used(`ip:${ip}`, PER_VISITOR.ms) >= PER_VISITOR.max || used(`tour:${slug}`, PER_TOUR.ms) >= PER_TOUR.max)
    return fail("Du har lige sendt en besked - prøv igen om lidt, eller ring til os.", 429);

  const name = clean(body.name, 100);
  const email = clean(body.email, 200);
  const phone = clean(body.phone, 40);
  const message = clean(body.message, 3000);
  const room = clean(body.room, 120);
  if (!name || !EMAIL.test(email) || message.length < 2) return fail("Udfyld navn, e-mail og besked.");
  if ((message.match(/https?:\/\/|www\./gi) ?? []).length > 2) return ok();

  const tour = await prisma.tour.findUnique({ where: { slug }, select: { config: true, published: true } });
  const T = tour?.config as unknown as TourConfig | undefined;
  const to = T?.contactForm ? (T.contactForm.to || T.contact?.email || "").trim() : "";
  if (!tour?.published || !T || !EMAIL.test(to)) return fail("Formularen virker ikke lige nu.", 404);

  const subject = `${(T.contactForm?.title || "Skriv til os").slice(0, 80)} - ny besked fra jeres virtuelle tour`;
  const bodyText = [
    "Hej,",
    "",
    `${name} har skrevet til jer fra jeres virtuelle tour (${T.title || slug}):`,
    "",
    `"${message}"`,
    "",
    `Navn: ${name}`,
    `E-mail: ${email}`,
    ...(phone ? [`Telefon: ${phone}`] : []),
    ...(room ? [`Skrevet, mens de så: ${room}`] : []),
    "",
    `Svar direkte på denne mail, så går svaret til ${name}.`,
    "",
    "Venlig hilsen",
    "Nextview360",
  ].join("\n");
  try {
    await sendSystemMail(null, { to: [to], subject, bodyText, fromName: "Kontaktformular - Nextview360", fromAddress: "kontaktformular@nextview360.dk", replyTo: email });
  } catch (err) {
    console.error("[tour-contact]", slug, err instanceof Error ? err.message : err);
    return fail("Beskeden kunne ikke sendes lige nu.", 502);
  }
  count(`ip:${ip}`, `tour:${slug}`);
  return ok();
}
