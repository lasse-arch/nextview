import { randomUUID } from "node:crypto";
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
  /** Shown as the event's place, e.g. the customer's address for a filming. */
  location?: string | null;
  /** Wall-clock date-time with no UTC offset (e.g. "2026-09-26T20:00:00") - interpreted in `timeZone`, not converted from UTC. */
  startIso: string;
  endIso: string;
  timeZone: string;
  /** Every attendee to invite - the calendar's own owner (the seller) isn't
   * added automatically just by creating the event on their calendar, so
   * they need to be listed explicitly to show up as a guest with an RSVP,
   * same as the customer. */
  attendeeEmails: (string | null | undefined)[];
  /** Attendees to mark as already accepted - the seller sending the invite
   * (their CRM login email, which can differ from the Google account's). */
  acceptedEmails?: (string | null | undefined)[];
  /** An online meeting: the invitation gets a Google Meet link. Left out = in person, never a Meet link. */
  online?: boolean;
};

export async function upsertCalendarEvent(account: EmailAccount, input: CalendarEventInput): Promise<string> {
  const accessToken = await getValidAccessToken(account);
  const uniqueEmails = [...new Set(input.attendeeEmails.filter((email): email is string => Boolean(email)).map((e) => e.trim()))];

  // PATCH replaces the whole attendee list, so an update would otherwise
  // reset everyone's existing RSVP back to "awaiting" - carry each guest's
  // current answer over from the event as it stands.
  const existingResponses = new Map<string, string>();
  let hasMeet = false;
  let reuseId = input.eventId;
  if (reuseId) {
    const current = await fetch(`${CALENDAR_API_BASE}/calendars/primary/events/${reuseId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (current.ok) {
      const data = (await current.json()) as { status?: string; end?: { dateTime?: string; date?: string }; attendees?: { email?: string; responseStatus?: string }[]; hangoutLink?: string };
      // An invitation whose day is over (or that was cancelled) is left as it
      // is - the meeting or filming happened then - and a new one is sent.
      const ended = data.end?.dateTime ?? data.end?.date;
      if (data.status === "cancelled" || (ended && new Date(ended).getTime() < Date.now())) {
        reuseId = null;
      } else {
        hasMeet = Boolean(data.hangoutLink);
        for (const a of data.attendees ?? []) {
          if (a.email && a.responseStatus) existingResponses.set(a.email.toLowerCase(), a.responseStatus);
        }
      }
    }
  }
  // The seller sending the invite is the organizer - they're going to the
  // meeting they booked, so they're marked "Ja" straight away instead of
  // showing up as awaiting their own invitation.
  const acceptedEmails = new Set(
    [account.email, ...(input.acceptedEmails ?? [])].filter((e): e is string => Boolean(e)).map((e) => e.trim().toLowerCase())
  );
  const attendees = uniqueEmails.map((email) => {
    const key = email.toLowerCase();
    const responseStatus = acceptedEmails.has(key) ? "accepted" : existingResponses.get(key);
    return responseStatus ? { email, responseStatus } : { email };
  });

  const details = {
    summary: input.summary,
    description: input.description,
    ...(input.location ? { location: input.location } : {}),
    start: { dateTime: input.startIso, timeZone: input.timeZone },
    end: { dateTime: input.endIso, timeZone: input.timeZone },
  };
  const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
  const eventsUrl = `${CALENDAR_API_BASE}/calendars/primary/events`;

  // No Google Meet link unless the meeting is online - our meetings and
  // filmings are in person, and customers seeing a video link think it's online. Google auto-adds Meet
  // to new events when the account has "Tilføj automatisk Google Meet" on,
  // so a new event is first created without guests (no mails go out),
  // then the guests are added in the same update that strips the Meet -
  // that way the invitation they receive never carries the link.
  // conferenceDataVersion=1 is what lets conferenceData: null remove it.
  let eventId = reuseId;
  if (!eventId) {
    const created = await fetch(`${eventsUrl}?sendUpdates=none&conferenceDataVersion=1`, {
      method: "POST",
      headers,
      body: JSON.stringify(details),
    });
    if (!created.ok) {
      throw new Error(`Google Kalender-fejl (${created.status}): ${await created.text()}`);
    }
    const made = (await created.json()) as { id: string; hangoutLink?: string };
    eventId = made.id;
    hasMeet = Boolean(made.hangoutLink);
  }
  // Online: keep the Meet link the event has, or ask Google for one.
  const conferenceData = !input.online
    ? null
    : hasMeet
      ? undefined
      : { createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } };

  const res = await fetch(`${eventsUrl}/${eventId}?sendUpdates=all&conferenceDataVersion=1`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      ...details,
      ...(conferenceData === undefined ? {} : { conferenceData }),
      attendees: attendees.length > 0 ? attendees : undefined,
    }),
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
  /** "outOfOffice" for a Calendar-native Out of Office block - these aren't
   * meetings and shouldn't count as one. */
  eventType: string | null;
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
      eventType?: string;
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
      eventType: e.eventType ?? null,
    }));
}
