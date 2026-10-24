"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { upsertCalendarEvent } from "@/lib/google-calendar";
import { MEETING_TIME_ZONE, toWallClockDateTime } from "@/lib/calendar-service";
import { buildFilmingDescription, formatFilmingDate, joinNames } from "@/lib/filming";
import { logActivity } from "@/lib/activity";
import { dealName } from "@/lib/labels";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type BookFilmingResult = { ok: true; sentTo: string[] } | { ok: false; error: string };

/**
 * "Book filming" on the deal page: saves when we come out to film, who from
 * Nextview360 is filming and the expected length, and sends a Google
 * Calendar invite from the booker's own calendar to the customer's contract
 * e-mail (plus an optional "Send også til" address) and the crew, with the
 * practical "ryd op inden"-text so expectations are aligned up front.
 *
 * filmingEventId is stored as "<organizerUserId>:<googleEventId>" - an event
 * can only be updated from its organizer's calendar, so a rebooking by the
 * same person moves the existing invite, while someone else rebooking sends
 * a new one.
 */
export async function bookFilming(
  dealId: string,
  input: { startLocal: string; hours: number; crewUserIds: string[]; contactEmail: string; extraEmails: string }
): Promise<BookFilmingResult> {
  const user = await requireUser();
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });

  const raw = input.startLocal.trim();
  if (!raw) return { ok: false, error: "Vælg dato og tidspunkt for optagelsen." };
  const start = new Date(/(Z|[+-]\d\d:?\d\d)$/.test(raw) ? raw : `${raw}Z`);
  if (isNaN(start.getTime())) return { ok: false, error: "Ugyldigt tidspunkt." };

  const hours = Number(input.hours);
  if (!(hours > 0 && hours <= 24)) return { ok: false, error: "Vælg hvor mange timer optagelsen tager." };
  if (input.crewUserIds.length === 0) return { ok: false, error: "Vælg hvem der skal filme." };

  const contactEmail = input.contactEmail.trim();
  if (!contactEmail) return { ok: false, error: "Der mangler en kunde-e-mail at sende invitationen til." };
  const extraEmails = input.extraEmails
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter(Boolean);
  for (const email of [contactEmail, ...extraEmails]) {
    if (!EMAIL_RE.test(email)) return { ok: false, error: `Ugyldig e-mail: ${email}` };
  }

  const account = await prisma.emailAccount.findUnique({
    where: { userId_provider: { userId: user.id, provider: "GOOGLE" } },
  });
  if (!account) return { ok: false, error: "Du har ikke forbundet Google under Indstillinger → E-mail." };

  const [organizer, crew] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
    prisma.user.findMany({ where: { id: { in: input.crewUserIds } }, orderBy: { name: "asc" } }),
  ]);
  const crewNames = crew.map((c) => c.name);
  const durationMinutes = Math.round(hours * 60);
  const end = new Date(start.getTime() + durationMinutes * 60_000);

  const description = buildFilmingDescription({
    start,
    hours,
    crewNames,
    contactName: deal.contactName,
    address: deal.address,
    organizer: {
      fullName: [organizer.name, organizer.lastName].filter(Boolean).join(" "),
      email: organizer.email,
      phone: organizer.phone,
    },
  });

  const [prevOrganizerId, prevEventId] = deal.filmingEventId?.split(":") ?? [];
  let eventId: string;
  try {
    eventId = await upsertCalendarEvent(account, {
      eventId: prevOrganizerId === user.id ? prevEventId : null,
      summary: `Optagelse: ${dealName(deal)} x Nextview360`,
      description,
      location: deal.address,
      startIso: toWallClockDateTime(start),
      endIso: toWallClockDateTime(end),
      timeZone: MEETING_TIME_ZONE,
      attendeeEmails: [contactEmail, ...extraEmails, ...crew.map((c) => c.email)],
      acceptedEmails: crew.some((c) => c.id === user.id) ? [organizer.email] : [],
    });
  } catch (err) {
    console.error("Filming invite failed", err);
    return { ok: false, error: err instanceof Error ? err.message : "Kalenderinvitationen kunne ikke sendes." };
  }

  await prisma.deal.update({
    where: { id: dealId },
    data: {
      filmingAt: start,
      filmingDurationMinutes: durationMinutes,
      filmingCrewIds: crew.map((c) => c.id).join(","),
      filmingEventId: `${user.id}:${eventId}`,
      ...(contactEmail !== deal.contactEmail && !deal.contactEmail ? { contactEmail } : {}),
    },
  });

  const { date, time } = formatFilmingDate(start);
  const sentTo = [contactEmail, ...extraEmails];
  await prisma.note.create({
    data: {
      dealId,
      authorId: user.id,
      kind: "MANUAL",
      body: `Optagelse booket ${date} kl. ${time} (ca. ${hours} t) med ${joinNames(crewNames)}. Invitation sendt til ${sentTo.join(", ")}.`,
    },
  });
  await logActivity({
    type: "DEAL_FILMING_BOOKED",
    message: `${user.name} bookede optagelse hos ${dealName(deal)} ${date} kl. ${time}`,
    actorId: user.id,
    dealId,
  });

  revalidatePath(`/deals/${dealId}`);
  return { ok: true, sentTo };
}
