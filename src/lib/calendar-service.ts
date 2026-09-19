import { prisma } from "@/lib/db";
import { upsertCalendarEvent } from "@/lib/google-calendar";
import { dealName } from "@/lib/labels";

const DEFAULT_MEETING_DURATION_MINUTES = 30;

export type CalendarSyncResult = { synced: boolean; reason?: string };

/**
 * Creates or updates a Google Calendar event for a deal's booked meeting,
 * on the deal owner's connected Google account, inviting the deal's
 * contact person. Never throws - integration is best-effort and must not
 * block saving the deal itself if Google isn't connected or errors out.
 */
export async function syncDealMeetingToCalendar(dealId: string): Promise<CalendarSyncResult> {
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
      startIso: start.toISOString(),
      endIso: end.toISOString(),
      attendeeEmail: deal.contactEmail,
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
