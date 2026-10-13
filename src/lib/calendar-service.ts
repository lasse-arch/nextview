import { prisma } from "@/lib/db";
import { upsertCalendarEvent } from "@/lib/google-calendar";
import { dealName } from "@/lib/labels";

const MEETING_TIME_ZONE = "Europe/Copenhagen";

export type CalendarSyncResult = { synced: boolean; reason?: string };

/**
 * meetingDate is parsed from a plain "datetime-local" form field with no
 * timezone info, so its stored instant's UTC digits are actually the
 * intended Europe/Copenhagen wall-clock digits (e.g. a form value of
 * "20:00" round-trips as 20:00 UTC, not 20:00 Copenhagen time). Google
 * Calendar must therefore receive those literal digits with an explicit
 * timeZone rather than a real UTC instant, or it double-converts and shows
 * the wrong local time (e.g. 22:00 in summer, when DST adds two hours).
 */
function toWallClockDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(
    date.getUTCHours()
  )}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

/**
 * Creates or updates a Google Calendar event for a deal's booked meeting,
 * on the deal owner's connected Google account, inviting both the deal's
 * contact person and the owner (seller) themselves - being the calendar
 * it's created on doesn't automatically add them as a guest with an RSVP,
 * so they'd otherwise be missing from the invite's guest list. Never
 * throws - integration is best-effort and must not block saving the deal
 * itself if Google isn't connected or errors out.
 *
 * `extraAttendeeEmails` lets whoever sends the invite pull in colleagues too
 * (e.g. Gustav inviting Victor along), on top of the owner and the contact.
 * `customBody`, if given, is inserted as an extra paragraph into the
 * standard invite text, for anything specific to this particular meeting.
 */
export async function syncDealMeetingToCalendar(
  dealId: string,
  extraAttendeeEmails: string[] = [],
  customBody?: string,
  durationMinutes?: number,
  /** Who sends the invite (from their own Google calendar, signed with
   * their name) - the deal's owner unless given, e.g. whoever booked the
   * meeting from the ringeliste. */
  organizerUserId?: string
): Promise<CalendarSyncResult> {
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, include: { owner: true } });
  if (!deal || !deal.meetingDate) {
    return { synced: false, reason: "Ingen mødedato sat." };
  }
  const organizer =
    organizerUserId && organizerUserId !== deal.ownerId
      ? await prisma.user.findUniqueOrThrow({ where: { id: organizerUserId } })
      : deal.owner;

  const account = await prisma.emailAccount.findUnique({
    where: { userId_provider: { userId: organizer.id, provider: "GOOGLE" } },
  });
  if (!account) {
    return {
      synced: false,
      reason:
        organizer.id === deal.ownerId
          ? "Ejeren har ikke forbundet Google under Indstillinger → E-mail."
          : "Du har ikke forbundet Google under Indstillinger → E-mail.",
    };
  }

  if (durationMinutes && durationMinutes !== deal.meetingDurationMinutes) {
    await prisma.deal.update({ where: { id: deal.id }, data: { meetingDurationMinutes: durationMinutes } });
  }

  const start = deal.meetingDate;
  const end = new Date(start.getTime() + (durationMinutes ?? deal.meetingDurationMinutes) * 60_000);

  const sellerFullName = [organizer.name, organizer.lastName].filter(Boolean).join(" ");
  const description = [
    "Hej,",
    "",
    "Tak for at du har sat tid af til at mødes med os.",
    "",
    "Vi glæder os til at snakke med dig og fortælle mere om, hvad vi kan hjælpe med.",
    ...(customBody?.trim() ? ["", customBody.trim()] : []),
    "",
    "Har du lyst til at kigge lidt nærmere på os inden mødet, er du velkommen til at besøge www.nextview360.dk",
    "",
    "Med venlig hilsen",
    sellerFullName,
    organizer.email,
    organizer.phone ?? "",
  ].join("\n");

  try {
    const eventId = await upsertCalendarEvent(account, {
      // An event lives in its organizer's calendar - one made from the
      // owner's can't be updated from someone else's, so that's a new one.
      eventId: organizer.id === deal.ownerId ? deal.googleCalendarEventId : null,
      summary: `${dealName(deal)} x Nextview360`,
      description,
      startIso: toWallClockDateTime(start),
      endIso: toWallClockDateTime(end),
      timeZone: MEETING_TIME_ZONE,
      attendeeEmails: [organizer.email, deal.contactEmail, ...extraAttendeeEmails],
      acceptedEmails: [organizer.email],
    });

    if (eventId !== deal.googleCalendarEventId) {
      await prisma.deal.update({ where: { id: deal.id }, data: { googleCalendarEventId: eventId } });
    }

    return { synced: true };
  } catch (err) {
    console.error("Google Calendar sync failed", err);
    return { synced: false, reason: err instanceof Error ? err.message : "Ukendt fejl" };
  }
}
