"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { danishMobile, sendSms, smsReady } from "@/lib/sms";
import { teamCan } from "@/lib/team-roles";

/*
 * Salg → "Send eksempel": while talking to a new customer, a seller types
 * their name and number and sends them one of our showcase tours on SMS
 * (Tour.showcase - chosen in the tour's Del og udgiv). Each send makes its
 * own showcase link (a TourDemoLink), so we see whether and when they open
 * it, from where and what they look at - and the seller gets a notification.
 * Only to someone who has said yes on the phone (the seller ticks it), at
 * most a handful a day per seller, Danish mobile numbers only.
 */

/** The text: {navn} and {link} are filled in when it's sent; the seller can change all of it. */
const TEMPLATE = "Hej {navn}\nHer kan du se et eksempel på, hvad vi laver: {link}\n\nVh\n{sælger}\nTlf: {tlf}\nWebsite: nextview360.dk";
const PER_DAY = 40;

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

export type DemoSmsSent = { id: string; at: string; to: string; tour: string; by: string; visits: number; lastSeen: string | null; where: string | null };

export type DemoSmsSetup = {
  tours: { slug: string; name: string }[];
  /** The text with the seller filled in - {navn} and {link} left for the send. */
  text: string;
  /** Sent from Arpo (GatewayAPI is set up) - else it opens on the seller's own phone. */
  direct: boolean;
  sent: DemoSmsSent[];
};

const COUNTRY: Record<string, string> = { DK: "Danmark", DE: "Tyskland", SE: "Sverige", NO: "Norge" };

/** What the page needs: the showcase tours, the text, and what's been sent lately (and opened). */
/** Which tours a seller may send to new customers: an admin any, the others those chosen as examples (Kan sendes som eksempel) and those already out (published). */
const sendable = (user: Parameters<typeof teamCan>[0]) => (teamCan(user, "admin") ? {} : { OR: [{ showcase: true }, { published: true }, { liveVersion: { not: null } }] });

export async function demoSmsSetup(): Promise<DemoSmsSetup> {
  const user = await requireUser();
  const [tours, links] = await Promise.all([
    prisma.tour.findMany({ where: sendable(user), select: { slug: true, name: true }, orderBy: [{ showcase: "desc" }, { name: "asc" }] }),
    prisma.tourDemoLink.findMany({
      where: { label: { endsWith: "(SMS)" } },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, label: true, createdAt: true, tourSlug: true, createdById: true, events: { select: { session: true, createdAt: true, city: true, country: true }, orderBy: { createdAt: "desc" } } },
    }),
  ]);
  const people = new Map((await prisma.user.findMany({ where: { id: { in: [...new Set(links.map((l) => l.createdById))] } }, select: { id: true, name: true } })).map((p) => [p.id, p.name]));
  const names = new Map((await prisma.tour.findMany({ where: { slug: { in: [...new Set(links.map((l) => l.tourSlug))] } }, select: { slug: true, name: true } })).map((t) => [t.slug, t.name]));
  return {
    tours,
    text: TEMPLATE.replace("{sælger}", user.name).replace("{tlf}", user.phone ?? ""),
    direct: smsReady(),
    sent: links.map((l) => {
      const e = l.events[0];
      return {
        id: l.id,
        at: l.createdAt.toISOString(),
        to: l.label.replace(/ \(SMS\)$/, ""),
        tour: names.get(l.tourSlug) ?? l.tourSlug,
        by: people.get(l.createdById) ?? "",
        visits: new Set(l.events.map((x) => x.session)).size,
        lastSeen: e?.createdAt.toISOString() ?? null,
        where: e ? [e.city, e.country ? (COUNTRY[e.country] ?? e.country) : null].filter(Boolean).join(", ") || null : null,
      };
    }),
  };
}

/**
 * Makes the customer's own showcase link and sends it. Without GatewayAPI set
 * up, the link is made all the same and the text comes back to be sent from
 * the seller's own phone.
 */
export async function sendDemoSms(input: { tourSlug: string; phone: string; name: string; text: string; consent: boolean }): Promise<{ ok: true; sent: boolean; text: string; phone: string } | { ok: false; error: string }> {
  const user = await requireUser();
  if (input.consent !== true) return { ok: false, error: "Sæt hak, når kunden har sagt ja til at få en SMS." };
  const tour = await prisma.tour.findFirst({ where: { slug: String(input.tourSlug), ...sendable(user) }, select: { slug: true, name: true } });
  if (!tour) return { ok: false, error: "Vælg en af eksempel-tourene." };
  const phone = danishMobile(input.phone);
  if (!phone) return { ok: false, error: "Skriv et dansk mobilnummer (8 cifre)." };
  const name = String(input.name ?? "").trim().slice(0, 80);
  const text = String(input.text ?? "").trim();
  if (!text.includes("{link}")) return { ok: false, error: "Teksten skal have {link} med - dér kommer linket til touren." };
  if (text.length > 600) return { ok: false, error: "Teksten er for lang (højst 600 tegn)." };
  const today = new Date(new Date().setHours(0, 0, 0, 0));
  const sentToday = await prisma.activityEvent.count({ where: { type: "DEMO_SMS", actorId: user.id, createdAt: { gte: today } } });
  if (sentToday >= PER_DAY) return { ok: false, error: `Du har sendt ${PER_DAY} i dag - det er grænsen.` };

  // The customer's own link: what they do on it is theirs, and the seller hears when they open it.
  const who = name || `+${phone}`;
  const link = await prisma.tourDemoLink.create({ data: { tourSlug: tour.slug, token: randomBytes(15).toString("base64url"), label: `${who} (SMS)`, createdById: user.id } });
  const url = `${(process.env.APP_BASE_URL || "https://nextview360.dk").replace(/\/+$/, "")}/vis/${link.token}`;
  const message = text.replaceAll("{navn}", firstName(name)).replace(/^Hej \n/, "Hej\n").replaceAll("{link}", url);
  let sent = false;
  if (smsReady()) {
    const r = await sendSms(phone, message);
    if (!r.ok) {
      await prisma.tourDemoLink.delete({ where: { id: link.id } }).catch(() => {});
      return { ok: false, error: r.error };
    }
    sent = true;
  }
  await logActivity({ type: "DEMO_SMS", message: `${user.name} sendte et eksempel (${tour.name}) på SMS til ${who}`, actorId: user.id });
  revalidatePath("/arpo/generator");
  return { ok: true, sent, text: message, phone: `+${phone}` };
}

/**
 * The mail generator's tours as showcase links: one link per tour for this
 * recipient (`to`, e.g. the company or the person), so they get the
 * walk-through too and we see whether they look. Only tours the seller may
 * send; the others keep their own address.
 */
export async function demoLinksForMail(slugs: string[], to: string): Promise<Record<string, string>> {
  const user = await requireUser();
  const want = [...new Set((slugs ?? []).map(String))].slice(0, 3);
  if (!want.length) return {};
  const tours = await prisma.tour.findMany({ where: { slug: { in: want }, ...sendable(user) }, select: { slug: true } });
  const who = String(to ?? "").trim().slice(0, 80) || "Mail";
  const base = (process.env.APP_BASE_URL || "https://nextview360.dk").replace(/\/+$/, "");
  const out: Record<string, string> = {};
  for (const t of tours) {
    const link = await prisma.tourDemoLink.create({ data: { tourSlug: t.slug, token: randomBytes(15).toString("base64url"), label: `${who} (mail)`, createdById: user.id } });
    out[t.slug] = `${base}/vis/${link.token}`;
  }
  return out;
}
