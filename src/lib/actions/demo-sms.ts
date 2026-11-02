"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { dealName } from "@/lib/labels";
import { danishMobile, sendSms, smsReady } from "@/lib/sms";

/*
 * "Send et eksempel på SMS": while talking to a new customer, a seller sends
 * them one of our showcase tours (Tour.showcase - chosen in the tour's
 * Del og udgiv) on SMS. Each send makes its own showcase link for that
 * customer (a TourDemoLink on the deal), so we see whether and when they open
 * it, from where and what they look at - and the seller gets a notification.
 * Only to someone who has said yes on the phone (the seller ticks it), at
 * most a handful a day per seller, Danish mobile numbers only.
 */

/** The text, with {navn} {link} {sælger} {tlf} filled in. Fixed by the seller each time if needed. */
const TEMPLATE = "Hej {navn}\nHer kan du se et eksempel på, hvad vi laver: {link}\n\nVh\n{sælger}\nTlf: {tlf}\nWebsite: nextview360.dk";
const PER_DAY = 40;

const firstName = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] ?? "";

export type DemoSmsSetup = {
  tours: { slug: string; name: string }[];
  phone: string;
  text: string;
  /** Sent from Arpo (GatewayAPI is set up) - else it opens on the seller's own phone. */
  direct: boolean;
  /** Showcase tours already sent to this customer. */
  sent: { at: string; tour: string; by: string; visits: number; lastSeen: string | null }[];
};

/** What the SMS dialog needs for a deal: the showcase tours, the customer's number and the text. */
export async function demoSmsSetup(dealId: string): Promise<DemoSmsSetup> {
  const user = await requireUser();
  const deal = await prisma.deal.findUnique({ where: { id: String(dealId) }, select: { contactName: true, contactPhone: true } });
  if (!deal) throw new Error("Kunden findes ikke.");
  const [tours, links] = await Promise.all([
    prisma.tour.findMany({ where: { showcase: true }, select: { slug: true, name: true }, orderBy: { name: "asc" } }),
    prisma.tourDemoLink.findMany({ where: { dealId: String(dealId) }, orderBy: { createdAt: "desc" }, take: 10, select: { createdAt: true, tourSlug: true, createdById: true, events: { select: { session: true, createdAt: true }, orderBy: { createdAt: "desc" } } } }),
  ]);
  const people = await prisma.user.findMany({ where: { id: { in: [...new Set(links.map((l) => l.createdById))] } }, select: { id: true, name: true } });
  const names = new Map((await prisma.tour.findMany({ where: { slug: { in: links.map((l) => l.tourSlug) } }, select: { slug: true, name: true } })).map((t) => [t.slug, t.name]));
  const text = TEMPLATE.replace("{navn}", firstName(deal.contactName) || "")
    .replace("Hej \n", "Hej\n")
    .replace("{sælger}", user.name)
    .replace("{tlf}", user.phone ?? "");
  return {
    tours,
    phone: deal.contactPhone ?? "",
    text,
    direct: smsReady(),
    sent: links.map((l) => ({
      at: l.createdAt.toISOString(),
      tour: names.get(l.tourSlug) ?? l.tourSlug,
      by: people.find((p) => p.id === l.createdById)?.name ?? "",
      visits: new Set(l.events.map((e) => e.session)).size,
      lastSeen: l.events[0]?.createdAt.toISOString() ?? null,
    })),
  };
}

/**
 * Makes the customer's own showcase link and sends it. Without GatewayAPI set
 * up, the link is made all the same and the text comes back to be sent from
 * the seller's phone (`openOnPhone`).
 */
export async function sendDemoSms(input: { dealId: string; tourSlug: string; phone: string; text: string; consent: boolean }): Promise<{ ok: true; sent: boolean; text: string; phone: string } | { ok: false; error: string }> {
  const user = await requireUser();
  if (input.consent !== true) return { ok: false, error: "Sæt hak, når kunden har sagt ja til at få en SMS." };
  const deal = await prisma.deal.findUnique({ where: { id: String(input.dealId) }, select: { id: true, companyName: true, displayName: true } });
  if (!deal) return { ok: false, error: "Kunden findes ikke." };
  const tour = await prisma.tour.findFirst({ where: { slug: String(input.tourSlug), showcase: true }, select: { slug: true, name: true } });
  if (!tour) return { ok: false, error: "Vælg en af eksempel-tourene." };
  const phone = danishMobile(input.phone);
  if (!phone) return { ok: false, error: "Skriv et dansk mobilnummer (8 cifre)." };
  const text = String(input.text ?? "").trim();
  if (!text.includes("{link}")) return { ok: false, error: "Teksten skal have {link} med - dér kommer linket til touren." };
  if (text.length > 600) return { ok: false, error: "Teksten er for lang (højst 600 tegn)." };
  const today = new Date(new Date().setHours(0, 0, 0, 0));
  const sentToday = await prisma.activityEvent.count({ where: { type: "DEMO_SMS", actorId: user.id, createdAt: { gte: today } } });
  if (sentToday >= PER_DAY) return { ok: false, error: `Du har sendt ${PER_DAY} i dag - det er grænsen.` };

  // The customer's own link: what they do on it is theirs, and shows on the deal.
  const link = await prisma.tourDemoLink.create({ data: { tourSlug: tour.slug, token: randomBytes(15).toString("base64url"), label: `${dealName(deal)} (SMS)`, createdById: user.id, dealId: deal.id } });
  const url = `${(process.env.APP_BASE_URL || "https://nextview360.dk").replace(/\/+$/, "")}/vis/${link.token}`;
  const message = text.replaceAll("{link}", url);
  let sent = false;
  if (smsReady()) {
    const r = await sendSms(phone, message);
    if (!r.ok) {
      await prisma.tourDemoLink.delete({ where: { id: link.id } }).catch(() => {});
      return { ok: false, error: r.error };
    }
    sent = true;
  }
  await logActivity({ type: "DEMO_SMS", message: `${user.name} sendte et eksempel (${tour.name}) på SMS til ${dealName(deal)}`, actorId: user.id, dealId: deal.id });
  revalidatePath(`/arpo/deals/${deal.id}`);
  return { ok: true, sent, text: message, phone: `+${phone}` };
}
