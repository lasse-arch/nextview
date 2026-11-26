import "server-only";
import type { Deal, User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { upsertCalendarEvent } from "@/lib/google-calendar";
import { MEETING_TIME_ZONE, toWallClockDateTime } from "@/lib/calendar-service";
import { buildFilmingDescription } from "@/lib/filming";
import { dealName } from "@/lib/labels";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type FilmingInput = { startLocal: string; hours: number; crewUserIds: string[]; contactEmail: string; extraEmails: string };

/**
 * The Google Calendar invitation for a filming (the first one, and a refilming): to the customer and the crew, from
 * the booker's calendar - or, when the booker isn't going, from the calendar of one who is. `prevEventId` is
 * "<organizerUserId>:<googleEventId>" of an invitation to move instead of sending a new one.
 */
export async function sendFilmingInvite(
  booker: Pick<User, "id">,
  deal: Pick<Deal, "contactName" | "address" | "companyName" | "displayName">,
  input: FilmingInput,
  opts: { prevEventId?: string | null; title?: string } = {}
): Promise<{ ok: true; start: Date; durationMinutes: number; crew: { id: string; name: string; email: string }[]; senderId: string; organizerName: string; eventId: string; sentTo: string[] } | { ok: false; error: string }> {
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
  for (const email of [contactEmail, ...extraEmails]) if (!EMAIL_RE.test(email)) return { ok: false, error: `Ugyldig e-mail: ${email}` };

  const filmers = await prisma.emailAccount.findMany({ where: { userId: { in: input.crewUserIds }, provider: "GOOGLE" } });
  const byFilmer = input.crewUserIds.includes(booker.id) ? null : input.crewUserIds.map((id) => filmers.find((a) => a.userId === id)).find(Boolean);
  const account = byFilmer ?? (await prisma.emailAccount.findUnique({ where: { userId_provider: { userId: booker.id, provider: "GOOGLE" } } }));
  if (!account) return { ok: false, error: "Du har ikke forbundet Google under Indstillinger → E-mail." };
  const senderId = account.userId;
  const [organizer, crew] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: senderId } }),
    prisma.user.findMany({ where: { id: { in: input.crewUserIds } }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true } }),
  ]);
  const durationMinutes = Math.round(hours * 60);
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  const description = buildFilmingDescription({
    start,
    hours,
    crewNames: crew.map((c) => c.name),
    contactName: deal.contactName,
    address: deal.address,
    organizer: { fullName: [organizer.name, organizer.lastName].filter(Boolean).join(" "), email: organizer.email, phone: organizer.phone },
  });
  const [prevOrganizerId, prevEventId] = opts.prevEventId?.split(":") ?? [];
  try {
    const eventId = await upsertCalendarEvent(account, {
      eventId: prevOrganizerId === senderId ? prevEventId : null,
      summary: `${opts.title ?? "Optagelse"}: ${dealName(deal)} x Nextview360`,
      description,
      location: deal.address,
      startIso: toWallClockDateTime(start),
      endIso: toWallClockDateTime(end),
      timeZone: MEETING_TIME_ZONE,
      attendeeEmails: [contactEmail, ...extraEmails, ...crew.map((c) => c.email)],
      acceptedEmails: crew.some((c) => c.id === senderId) ? [organizer.email] : [],
    });
    return { ok: true, start, durationMinutes, crew, senderId, organizerName: organizer.name, eventId: `${senderId}:${eventId}`, sentTo: [contactEmail, ...extraEmails] };
  } catch (err) {
    console.error("Filming invite failed", err);
    return { ok: false, error: err instanceof Error ? err.message : "Kalenderinvitationen kunne ikke sendes." };
  }
}
