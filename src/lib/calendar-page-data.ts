import { prisma } from "@/lib/db";
import { listCalendarEvents, type GoogleCalendarEvent } from "@/lib/google-calendar";
import { dealName } from "@/lib/labels";

const CPH_TZ = "Europe/Copenhagen";

/** "Out of Office" (Calendar's own block type, or someone manually titling a
 * block "OOO"/"Out of office") isn't a meeting and must not count as one -
 * neither shown on the grid nor counted in the meeting-hours stats. */
function isOutOfOffice(event: Pick<GoogleCalendarEvent, "eventType" | "summary">): boolean {
  if (event.eventType === "outOfOffice") return true;
  return /\bout[\s-]?of[\s-]?office\b|\bo\.?o\.?o\.?\b/i.test(event.summary);
}

/** Adds `days` via pure UTC date math - avoids any ambiguity from the
 * server's local timezone setting, unlike date-fns' local-getter-based helpers. */
function addUtcDays(date: Date, days: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

/**
 * Monday-anchored UTC-midnight date for the week containing `date`. Uses
 * `date`'s own UTC digits as the "day" - consistent with how a Deal's
 * meetingDate is stored (its UTC digits are the *intended* Europe/Copenhagen
 * wall-clock digits, not a real UTC instant - see calendar-service.ts), so
 * this lines up correctly against that field without any conversion.
 */
function utcWeekStart(date: Date): Date {
  const dow = date.getUTCDay(); // 0=Sun..6=Sat
  const daysSinceMonday = (dow + 6) % 7;
  return addUtcDays(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())), -daysSinceMonday);
}

function dayKeyOf(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export type CalendarMeeting = {
  id: string;
  dayKey: string;
  /** -1 for an all-day event. */
  hour: number;
  minute: number;
  label: string;
  /** Deal link, or null for a meeting only found in Google Calendar. */
  href: string | null;
  ownerName: string;
  /** Matched User id for whoever booked/organized it - null when the
   * organizer isn't one of our own sellers (e.g. an external organizer), in
   * which case it can't be attributed to anyone for the per-seller stats. */
  ownerUserId: string | null;
  source: "crm" | "google";
  /** 0 for an all-day event - not meaningful in minutes. */
  durationMinutes: number;
  /** Other sellers invited to this meeting (excluding the organizer shown as
   * ownerName) - shown as a hover tooltip rather than a separate card, since
   * Google gives every attendee's calendar its own copy of the same event. */
  invitedNames?: string[];
};

export type CalendarWeek = {
  /** Each of the 7 days (Mon-Sun) as { dayKey, date }. */
  days: { dayKey: string; date: Date }[];
  meetings: CalendarMeeting[];
  weekLabel: string;
};

/**
 * All CRM-booked meetings plus any Google Calendar events for the week not
 * already represented by a CRM deal (matched via googleCalendarEventId, so a
 * meeting synced out to Google via "Send kalenderinvitation" doesn't show
 * twice). `weekOffset` is relative to the current real week (0 = this week).
 */
export async function getCalendarWeek(weekOffset: number): Promise<CalendarWeek> {
  const now = new Date();
  const weekStart = addUtcDays(utcWeekStart(now), weekOffset * 7);
  const weekEnd = addUtcDays(weekStart, 7);

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addUtcDays(weekStart, i);
    return { dayKey: dayKeyOf(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()), date };
  });

  const deals = await prisma.deal.findMany({
    where: { meetingDate: { gte: weekStart, lt: weekEnd } },
    select: {
      id: true,
      companyName: true,
      displayName: true,
      meetingDate: true,
      meetingDurationMinutes: true,
      googleCalendarEventId: true,
      ownerId: true,
      owner: { select: { name: true, lastName: true } },
    },
    orderBy: { meetingDate: "asc" },
  });

  const crmMeetings: CalendarMeeting[] = deals.map((d) => ({
    id: `deal-${d.id}`,
    dayKey: dayKeyOf(d.meetingDate!.getUTCFullYear(), d.meetingDate!.getUTCMonth(), d.meetingDate!.getUTCDate()),
    hour: d.meetingDate!.getUTCHours(),
    minute: d.meetingDate!.getUTCMinutes(),
    label: dealName(d),
    href: `/deals/${d.id}`,
    ownerName: [d.owner.name, d.owner.lastName].filter(Boolean).join(" "),
    ownerUserId: d.ownerId,
    durationMinutes: d.meetingDurationMinutes,
    source: "crm",
  }));

  const knownGoogleEventIds = new Set(deals.map((d) => d.googleCalendarEventId).filter((id): id is string => Boolean(id)));

  const accounts = await prisma.emailAccount.findMany({
    where: { provider: "GOOGLE" },
    include: { user: { select: { name: true, lastName: true } } },
  });

  // Resolve organizer/attendee emails back to a seller's display name -
  // needed because Google gives every attendee's own calendar an identical
  // copy of the same event (same id, same organizer/attendees), which is
  // exactly what lets it be collapsed to one card instead of one per invitee.
  const allUsers = await prisma.user.findMany({ select: { id: true, email: true, name: true, lastName: true } });
  const userByEmail = new Map(
    allUsers.map((u) => [u.email.toLowerCase(), { id: u.id, name: [u.name, u.lastName].filter(Boolean).join(" ") }])
  );

  // Padded by a day on each side so no real event can be clipped by a DST
  // offset near the week boundary - events outside the 7 real days are
  // filtered back out below via dayKeys.
  const timeMinIso = addUtcDays(weekStart, -1).toISOString();
  const timeMaxIso = addUtcDays(weekEnd, 1).toISOString();
  const dayKeys = new Set(days.map((d) => d.dayKey));

  const seenGoogleEventIds = new Set<string>();
  const googleMeetings: CalendarMeeting[] = [];
  for (const account of accounts) {
    try {
      const events = await listCalendarEvents(account, { timeMinIso, timeMaxIso });
      const fallbackOwnerName = [account.user.name, account.user.lastName].filter(Boolean).join(" ");

      for (const event of events) {
        if (knownGoogleEventIds.has(event.id) || seenGoogleEventIds.has(event.id)) continue;
        if (isOutOfOffice(event)) continue;
        seenGoogleEventIds.add(event.id);

        const start = new Date(event.startIso);
        if (Number.isNaN(start.getTime())) continue;

        const organizer = event.organizerEmail ? userByEmail.get(event.organizerEmail.toLowerCase()) : undefined;
        const invitedNames = event.attendeeEmails
          .map((email) => userByEmail.get(email.toLowerCase())?.name)
          .filter((name): name is string => Boolean(name) && name !== (organizer?.name ?? fallbackOwnerName));

        const durationMinutes = event.isAllDay
          ? 0
          : Math.max(0, Math.round((new Date(event.endIso).getTime() - start.getTime()) / 60_000));

        const base = {
          id: `google-${event.id}`,
          label: event.summary,
          href: null,
          ownerName: organizer?.name ?? fallbackOwnerName,
          ownerUserId: organizer?.id ?? null,
          durationMinutes,
          source: "google" as const,
          ...(invitedNames.length > 0 ? { invitedNames: [...new Set(invitedNames)] } : {}),
        };

        if (event.isAllDay) {
          // All-day events come back as a bare "YYYY-MM-DD" (no timezone to convert).
          const dKey = event.startIso.slice(0, 10);
          if (!dayKeys.has(dKey)) continue;
          googleMeetings.push({ ...base, dayKey: dKey, hour: -1, minute: 0 });
          continue;
        }

        const parts = new Intl.DateTimeFormat("en-CA", {
          timeZone: CPH_TZ,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).formatToParts(start);
        const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
        const dKey = `${get("year")}-${get("month")}-${get("day")}`;
        if (!dayKeys.has(dKey)) continue;

        googleMeetings.push({ ...base, dayKey: dKey, hour: Number(get("hour")), minute: Number(get("minute")) });
      }
    } catch (err) {
      console.error(`Kunne ikke hente Google Kalender for ${ownerNameOf(account)}`, err);
    }
  }

  const meetings = [...crmMeetings, ...googleMeetings].sort((a, b) => {
    if (a.dayKey !== b.dayKey) return a.dayKey < b.dayKey ? -1 : 1;
    if (a.hour !== b.hour) return a.hour - b.hour;
    return a.minute - b.minute;
  });

  const weekLabel = `${formatShortDate(days[0].date)} - ${formatShortDate(days[6].date)} ${days[6].date.getUTCFullYear()}`;

  return { days, meetings, weekLabel };
}

function ownerNameOf(account: { user: { name: string; lastName: string | null } }): string {
  return [account.user.name, account.user.lastName].filter(Boolean).join(" ");
}

function formatShortDate(date: Date): string {
  return new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "short", timeZone: "UTC" }).format(date);
}

export type SellerMeetingStats = {
  userId: string;
  name: string;
  thisWeek: number;
  thisMonth: number;
  hoursThisWeek: number;
};

/** Standard full-time work week - the reference "timer på arbejde" is measured against. */
const STANDARD_WORK_HOURS_PER_WEEK = 37;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Meeting counts/hours for the current real week/month (independent of
 * which week the calendar grid above is currently showing). The weekly
 * figures - both the count and the hours - are read from the same merged
 * CRM+Google, Out-of-Office-filtered calendar the grid renders, so they line
 * up with what's actually shown there; the monthly count stays CRM-only
 * (a month of Google Calendar fetches across every seller isn't worth the
 * cost just for one extra number).
 */
export async function getMeetingStats(currentWeek?: CalendarWeek): Promise<{
  thisWeekTotal: number;
  thisMonthTotal: number;
  hoursThisWeek: number;
  workHoursThisWeek: number;
  bySeller: SellerMeetingStats[];
}> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const [thisWeek, monthDeals, users] = await Promise.all([
    currentWeek ?? getCalendarWeek(0),
    prisma.deal.findMany({
      where: { meetingDate: { gte: monthStart, lt: monthEnd } },
      select: { ownerId: true },
    }),
    prisma.user.findMany({ select: { id: true, name: true, lastName: true }, orderBy: { name: "asc" } }),
  ]);

  const timedMeetings = thisWeek.meetings.filter((m) => m.hour !== -1);
  const thisWeekTotal = thisWeek.meetings.length;
  const thisMonthTotal = monthDeals.length;
  const hoursThisWeek = round1(timedMeetings.reduce((sum, m) => sum + m.durationMinutes, 0) / 60);
  const workHoursThisWeek = users.length * STANDARD_WORK_HOURS_PER_WEEK;

  const bySeller = users
    .map((u) => {
      const weekMeetings = thisWeek.meetings.filter((m) => m.ownerUserId === u.id);
      const weekTimedMeetings = weekMeetings.filter((m) => m.hour !== -1);
      return {
        userId: u.id,
        name: [u.name, u.lastName].filter(Boolean).join(" "),
        thisWeek: weekMeetings.length,
        thisMonth: monthDeals.filter((d) => d.ownerId === u.id).length,
        hoursThisWeek: round1(weekTimedMeetings.reduce((sum, m) => sum + m.durationMinutes, 0) / 60),
      };
    })
    .filter((s) => s.thisMonth > 0 || s.thisWeek > 0)
    .sort((a, b) => b.thisMonth - a.thisMonth);

  return { thisWeekTotal, thisMonthTotal, hoursThisWeek, workHoursThisWeek, bySeller };
}
