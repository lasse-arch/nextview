"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatFilmingDate, joinNames } from "@/lib/filming";
import { sendFilmingInvite, type FilmingInput } from "@/lib/filming-invite";
import { annualRefilming } from "@/lib/refilming";
import { logActivity } from "@/lib/activity";
import { dealName } from "@/lib/labels";

export type BookFilmingResult = { ok: true; sentTo: string[] } | { ok: false; error: string };

/**
 * "Book filming" on the deal page: saves when we come out to film, who from
 * Nextview360 is filming and the expected length, and sends a Google
 * Calendar invite (lib/filming-invite.ts) to the customer's contract e-mail
 * (plus an optional "Send også til" address) and the crew, with the
 * practical "ryd op inden"-text so expectations are aligned up front.
 *
 * filmingEventId is stored as "<organizerUserId>:<googleEventId>" - an event
 * can only be updated from its organizer's calendar, so a rebooking by the
 * same person moves the existing invite, while someone else rebooking sends
 * a new one.
 */
export async function bookFilming(dealId: string, input: FilmingInput): Promise<BookFilmingResult> {
  const user = await requireUser();
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  const r = await sendFilmingInvite(user, deal, input, { prevEventId: deal.filmingEventId });
  if (!r.ok) return r;

  await prisma.deal.update({
    where: { id: dealId },
    data: {
      filmingAt: r.start,
      filmingDurationMinutes: r.durationMinutes,
      filmingCrewIds: r.crew.map((c) => c.id).join(","),
      filmingEventId: r.eventId,
      ...(input.contactEmail.trim() !== deal.contactEmail && !deal.contactEmail ? { contactEmail: input.contactEmail.trim() } : {}),
    },
  });

  const { date, time } = formatFilmingDate(r.start);
  const fromOther = r.senderId !== user.id;
  await prisma.note.create({
    data: {
      dealId,
      authorId: user.id,
      kind: "MANUAL",
      body: `Optagelse booket ${date} kl. ${time} (ca. ${input.hours} t) med ${joinNames(r.crew.map((c) => c.name))}. Invitation sendt til ${r.sentTo.join(", ")}${fromOther ? ` fra ${r.organizerName}s kalender (booket af ${user.name})` : ""}.`,
    },
  });
  await logActivity({
    type: "DEAL_FILMING_BOOKED",
    message: `${user.name} bookede optagelse hos ${dealName(deal)} ${date} kl. ${time}${fromOther ? ` (sendt fra ${r.organizerName}s kalender)` : ""}`,
    actorId: user.id,
    dealId,
  });

  revalidatePath(`/arpo/deals/${dealId}`);
  return { ok: true, sentTo: r.sentTo };
}

/**
 * The filming brief: what the seller agreed with the customer - drone or not, and where and what to film - for the
 * one filming (they see it on "Mine filmninger").
 */
export async function saveFilmingBrief(dealId: string, input: { drone: boolean | null; brief: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const brief = String(input.brief ?? "").trim().slice(0, 5000);
  if (input.drone === null || input.drone === undefined) return { ok: false, error: "Vælg om der skal drone med." };
  if (brief.length < 10) return { ok: false, error: "Skriv hvad der er aftalt med kunden - hvor og hvad der skal filmes." };
  const deal = await prisma.deal.findUnique({ where: { id: String(dealId) }, select: { id: true } });
  if (!deal) return { ok: false, error: "Dealen findes ikke." };
  await prisma.deal.update({ where: { id: deal.id }, data: { filmingDrone: Boolean(input.drone), filmingBrief: brief, filmingBriefAt: new Date(), filmingBriefById: user.id } });
  revalidatePath(`/arpo/deals/${deal.id}`);
  return { ok: true };
}

/**
 * Genoptagelse: filming a customer again, once their tour is live - with its own brief and calendar invitation.
 * `annual`: it uses the contract's yearly refilming (only while there's one left this contract year).
 */
export async function bookRefilming(
  dealId: string,
  input: FilmingInput & { drone: boolean | null; brief: string; annual: boolean }
): Promise<BookFilmingResult> {
  const user = await requireUser();
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: String(dealId) }, include: { refilmings: true } });
  if (deal.stage !== "LIVE") return { ok: false, error: "Genoptagelse kan bookes, når kunden er live." };
  const brief = String(input.brief ?? "").trim().slice(0, 5000);
  if (input.drone === null || input.drone === undefined) return { ok: false, error: "Vælg om der skal drone med." };
  if (brief.length < 10) return { ok: false, error: "Skriv hvad der skal filmes igen - og hvorfor." };
  const r = await sendFilmingInvite(user, deal, input, { title: "Genoptagelse" });
  if (!r.ok) return r;
  const allowance = annualRefilming(deal, deal.refilmings, r.start);
  const annual = Boolean(input.annual && allowance && allowance.left > 0);
  await prisma.refilming.create({
    data: { dealId: deal.id, at: r.start, durationMinutes: r.durationMinutes, crewIds: r.crew.map((c) => c.id).join(","), eventId: r.eventId, drone: Boolean(input.drone), brief, annual, createdById: user.id },
  });
  const { date, time } = formatFilmingDate(r.start);
  await prisma.note.create({
    data: {
      dealId: deal.id,
      authorId: user.id,
      kind: "MANUAL",
      body: `Genoptagelse booket ${date} kl. ${time} (ca. ${input.hours} t) med ${joinNames(r.crew.map((c) => c.name))}${annual ? " - bruger den årlige genoptagelse" : input.annual ? " - ingen årlig genoptagelse tilbage, så den er ekstra" : " - ekstra genoptagelse"}. Invitation sendt til ${r.sentTo.join(", ")}.`,
    },
  });
  await logActivity({ type: "DEAL_FILMING_BOOKED", message: `${user.name} bookede genoptagelse hos ${dealName(deal)} ${date} kl. ${time}`, actorId: user.id, dealId: deal.id });
  revalidatePath(`/arpo/deals/${deal.id}`);
  return { ok: true, sentTo: r.sentTo };
}

/** Cancels a booked refilming in Arpo (the yearly one is free again) - the calendar invitation is cancelled by hand. */
export async function cancelRefilming(refilmingId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const r = await prisma.refilming.findUnique({ where: { id: String(refilmingId) } });
  if (!r || r.cancelledAt) return { ok: false, error: "Genoptagelsen findes ikke." };
  await prisma.refilming.update({ where: { id: r.id }, data: { cancelledAt: new Date() } });
  await prisma.note.create({ data: { dealId: r.dealId, authorId: user.id, kind: "MANUAL", body: `Genoptagelse ${formatFilmingDate(r.at).date} aflyst af ${user.name}.` } });
  revalidatePath(`/arpo/deals/${r.dealId}`);
  return { ok: true };
}
