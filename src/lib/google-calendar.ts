import { prisma } from "@/lib/db";
import type { EmailAccount } from "@prisma/client";

const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";

async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) throw new Error(`Kunne ikke forny Google-adgangstoken: ${await res.text()}`);
  const tokens = (await res.json()) as { access_token: string; expires_in: number };
  return { accessToken: tokens.access_token, expiresAt: new Date(Date.now() + tokens.expires_in * 1000) };
}

export async function getValidAccessToken(account: EmailAccount): Promise<string> {
  const stillValid = account.accessToken && account.expiresAt && account.expiresAt.getTime() > Date.now() + 60_000;
  if (stillValid) return account.accessToken!;

  if (!account.refreshToken) {
    throw new Error("Google-forbindelsen mangler et refresh-token. Forbind Gmail igen under Indstillinger.");
  }

  const { accessToken, expiresAt } = await refreshAccessToken(account.refreshToken);
  await prisma.emailAccount.update({
    where: { id: account.id },
    data: { accessToken, expiresAt },
  });
  return accessToken;
}

export type CalendarEventInput = {
  eventId: string | null;
  summary: string;
  description?: string;
  /** Wall-clock date-time with no UTC offset (e.g. "2026-09-26T20:00:00") - interpreted in `timeZone`, not converted from UTC. */
  startIso: string;
  endIso: string;
  timeZone: string;
  /** Every attendee to invite - the calendar's own owner (the seller) isn't
   * added automatically just by creating the event on their calendar, so
   * they need to be listed explicitly to show up as a guest with an RSVP,
   * same as the customer. */
  attendeeEmails: (string | null | undefined)[];
};

export async function upsertCalendarEvent(account: EmailAccount, input: CalendarEventInput): Promise<string> {
  const accessToken = await getValidAccessToken(account);
  const uniqueEmails = [...new Set(input.attendeeEmails.filter((email): email is string => Boolean(email)).map((e) => e.trim()))];
  const attendees = uniqueEmails.map((email) => ({ email }));

  const body = {
    summary: input.summary,
    description: input.description,
    start: { dateTime: input.startIso, timeZone: input.timeZone },
    end: { dateTime: input.endIso, timeZone: input.timeZone },
    attendees: attendees.length > 0 ? attendees : undefined,
  };

  const url = input.eventId
    ? `${CALENDAR_API_BASE}/calendars/primary/events/${input.eventId}?sendUpdates=all`
    : `${CALENDAR_API_BASE}/calendars/primary/events?sendUpdates=all`;

  const res = await fetch(url, {
    method: input.eventId ? "PATCH" : "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Google Kalender-fejl (${res.status}): ${await res.text()}`);
  }

  const event = (await res.json()) as { id: string };
  return event.id;
}
