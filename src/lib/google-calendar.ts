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

export type GoogleCalendarEvent = {
  id: string;
  summary: string;
  /** Real, timezone-aware instant as returned by Google (has an offset, e.g.
   * "2026-09-25T14:00:00+02:00") - unlike our own meetingDate field, this is
   * safe to parse with `new Date(...)` directly. */
  startIso: string;
  endIso: string;
  isAllDay: boolean;
  /** Who booked the meeting - Google keeps this (and the event `id`) the
   * same across every attendee's own calendar, which is what lets a shared
   * internal meeting be de-duplicated down to one card instead of showing
   * once per invited seller. */
  organizerEmail: string | null;
  attendeeEmails: string[];
};

/** Lists events on the account's primary calendar within [timeMinIso, timeMaxIso) - used
 * to show meetings booked directly in Google Calendar (not via the CRM) on the calendar page. */
export async function listCalendarEvents(
  account: EmailAccount,
  range: { timeMinIso: string; timeMaxIso: string }
): Promise<GoogleCalendarEvent[]> {
  const accessToken = await getValidAccessToken(account);
  const params = new URLSearchParams({
    timeMin: range.timeMinIso,
    timeMax: range.timeMaxIso,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });

  const res = await fetch(`${CALENDAR_API_BASE}/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Google Kalender-fejl (${res.status}): ${await res.text()}`);

  const data = (await res.json()) as {
    items?: {
      id: string;
      summary?: string;
      status?: string;
      start?: { date?: string; dateTime?: string };
      end?: { date?: string; dateTime?: string };
      organizer?: { email?: string };
      attendees?: { email?: string }[];
    }[];
  };

  return (data.items ?? [])
    .filter((e) => e.status !== "cancelled" && (e.start?.dateTime || e.start?.date))
    .map((e) => ({
      id: e.id,
      summary: e.summary?.trim() || "(uden titel)",
      startIso: (e.start!.dateTime ?? e.start!.date)!,
      endIso: e.end?.dateTime ?? e.end?.date ?? (e.start!.dateTime ?? e.start!.date)!,
      isAllDay: !e.start!.dateTime,
      organizerEmail: e.organizer?.email ?? null,
      attendeeEmails: (e.attendees ?? []).map((a) => a.email).filter((email): email is string => Boolean(email)),
    }));
}
