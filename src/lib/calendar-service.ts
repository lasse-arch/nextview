import { prisma } from "@/lib/db";
import { upsertCalendarEvent } from "@/lib/google-calendar";
import { dealName } from "@/lib/labels";

const DEFAULT_MEETING_DURATION_MINUTES = 30;
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
 */
export async function syncDealMeetingToCalendar(
  dealId: string,
  extraAttendeeEmails: string[] = []
): Promise<CalendarSyncResult> {
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, include: { owner: true } });
  if (!deal || !deal.meetingDate) {
    return { synced: false, reason: "Ingen mødedato sat." };
  }

  const account = await prisma.emailAccount.findUnique({
    where: { userId_provider: { userId: deal.ownerId, provider: "GOOGLE" } },
  });
  if (!account) {
    return { synced: false, reason: "Ejeren har ikke forbundet Google under Indstillinger → E-mail." };
  }

  const start = deal.meetingDate;
  const end = new Date(start.getTime() + DEFAULT_MEETING_DURATION_MINUTES * 60_000);

  const sellerFullName = [deal.owner.name, deal.owner.lastName].filter(Boolean).join(" ");
  const description = [
    "Tusind tak fordi du har lyst til at bruge din tid på at høre mere om, hvordan vi kan hjælpe jer.",
    "",
    "Jeg ser frem til at mødes med dig.",
    "",
    "Du kan læse mere om os på www.nextview360.dk",
    "",
    "Mvh",
    sellerFullName,
    deal.owner.email,
    deal.owner.phone ?? "",
  ].join("\n");

  try {
    const eventId = await upsertCalendarEvent(account, {
      eventId: deal.googleCalendarEventId,
      summary: `${dealName(deal)} x Nextview360`,
      description,
      startIso: toWallClockDateTime(start),
      endIso: toWallClockDateTime(end),
      timeZone: MEETING_TIME_ZONE,
      attendeeEmails: [deal.owner.email, deal.contactEmail, ...extraAttendeeEmails],
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
