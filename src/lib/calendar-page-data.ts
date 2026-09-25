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

/**
 * Whether a Google-only event is an internal team thing rather than a
 * customer meeting - explicitly marked by whoever wrote the title, the same
 * way OOO is detected, rather than guessed. An earlier version guessed this
 * from "every attendee is one of our own users", which false-positived on
 * things like a personal reminder ("Ring til Lars") that happened to have a
 * colleague along - titling isn't a guess, it's what the person meant.
 * Recognizes "internt" as a whole word anywhere in the title, so "[internt]",
 * "(internt)" or just "internt mandagsmøde" all work.
 */
function isMarkedInternal(summary: string): boolean {
  return /\binternt\b/i.test(summary);
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

/** "YYYY-MM-DD" sorts lexicographically the same as chronologically, so a
 * plain string comparison against the range's own day keys is enough to
 * check membership - no need to materialize every day in between. */
function dayKeyInRange(dKey: string, rangeStart: Date, rangeEnd: Date): boolean {
  const startKey = dayKeyOf(rangeStart.getUTCFullYear(), rangeStart.getUTCMonth(), rangeStart.getUTCDate());
  const endKey = dayKeyOf(rangeEnd.getUTCFullYear(), rangeEnd.getUTCMonth(), rangeEnd.getUTCDate());
  return dKey >= startKey && dKey < endKey;
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
  /** True when the event's own title is marked "internt" (see
   * isMarkedInternal) - an internal team thing, not a customer meeting, so
   * it's excluded from the meeting stats even though it still shows on the
   * grid. Always false for a CRM-sourced meeting. */
  isInternal: boolean;
  /** Other sellers invited to this meeting (excluding the organizer shown as
   * ownerName) - shown as a hover tooltip rather than a separate card, since
   * Google gives every attendee's calendar its own copy of the same event. */
  invitedNames?: string[];
};

function ownerNameOf(account: { user: { name: string; lastName: string | null } }): string {
  return [account.user.name, account.user.lastName].filter(Boolean).join(" ");
}

/**
 * All CRM-booked meetings in [rangeStart, rangeEnd) plus any Google Calendar
 * events in that same window not already represented by a CRM deal (matched
 * via googleCalendarEventId, so a meeting synced out to Google via "Send
 * kalenderinvitation" doesn't show twice) - the single source both the week
 * grid and the week/month stats read from, so a meeting is counted exactly
 * the same way everywhere it's counted at all.
 */
async function fetchMergedMeetings(rangeStart: Date, rangeEnd: Date): Promise<CalendarMeeting[]> {
  const deals = await prisma.deal.findMany({
    where: { meetingDate: { gte: rangeStart, lt: rangeEnd } },
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
    isInternal: false,
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
  // offset near the range boundary - events outside the real range are
  // filtered back out below via dayKeyInRange.
  const timeMinIso = addUtcDays(rangeStart, -1).toISOString();
  const timeMaxIso = addUtcDays(rangeEnd, 1).toISOString();

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

        const isInternal = isMarkedInternal(event.summary);

        const base = {
          id: `google-${event.id}`,
          label: event.summary,
          href: null,
          ownerName: organizer?.name ?? fallbackOwnerName,
          ownerUserId: organizer?.id ?? null,
          durationMinutes,
          isInternal,
          source: "google" as const,
          ...(invitedNames.length > 0 ? { invitedNames: [...new Set(invitedNames)] } : {}),
        };

        if (event.isAllDay) {
          // All-day events come back as a bare "YYYY-MM-DD" (no timezone to convert).
          const dKey = event.startIso.slice(0, 10);
          if (!dayKeyInRange(dKey, rangeStart, rangeEnd)) continue;
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
        if (!dayKeyInRange(dKey, rangeStart, rangeEnd)) continue;

        googleMeetings.push({ ...base, dayKey: dKey, hour: Number(get("hour")), minute: Number(get("minute")) });
      }
    } catch (err) {
      console.error(`Kunne ikke hente Google Kalender for ${ownerNameOf(account)}`, err);
    }
  }

  return [...crmMeetings, ...googleMeetings].sort((a, b) => {
    if (a.dayKey !== b.dayKey) return a.dayKey < b.dayKey ? -1 : 1;
    if (a.hour !== b.hour) return a.hour - b.hour;
    return a.minute - b.minute;
  });
}

export type CalendarWeek = {
  /** Each of the 7 days (Mon-Sun) as { dayKey, date }. */
  days: { dayKey: string; date: Date }[];
  meetings: CalendarMeeting[];
  weekLabel: string;
};

/** `weekOffset` is relative to the current real week (0 = this week). */
export async function getCalendarWeek(weekOffset: number): Promise<CalendarWeek> {
  const now = new Date();
  const weekStart = addUtcDays(utcWeekStart(now), weekOffset * 7);
  const weekEnd = addUtcDays(weekStart, 7);

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addUtcDays(weekStart, i);
    return { dayKey: dayKeyOf(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()), date };
  });

  const meetings = await fetchMergedMeetings(weekStart, weekEnd);
  const weekLabel = `${formatShortDate(days[0].date)} - ${formatShortDate(days[6].date)} ${days[6].date.getUTCFullYear()}`;

  return { days, meetings, weekLabel };
}

function formatShortDate(date: Date): string {
  return new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "short", timeZone: "UTC" }).format(date);
}

export type MonthBar = { label: string; value: number };

/**
 * Meetings actually booked per month, for the last `monthsBack` months
 * including the current one - CRM + Google, Out-of-Office/internal
 * excluded, same as everything else on this page. Fetched as a single
 * merged range covering the whole window rather than one call per month:
 * Google's events.list already covers an arbitrary date span in one request
 * per connected account, so there's no need to repeat that per month.
 */
export async function getMeetingsPerMonth(monthsBack = 6): Promise<MonthBar[]> {
  const now = new Date();
  const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const rangeStart = new Date(Date.UTC(currentMonthStart.getUTCFullYear(), currentMonthStart.getUTCMonth() - (monthsBack - 1), 1));
  const rangeEnd = new Date(Date.UTC(currentMonthStart.getUTCFullYear(), currentMonthStart.getUTCMonth() + 1, 1));

  const meetings = (await fetchMergedMeetings(rangeStart, rangeEnd)).filter((m) => !m.isInternal);

  const bars: MonthBar[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const m = new Date(Date.UTC(currentMonthStart.getUTCFullYear(), currentMonthStart.getUTCMonth() - i, 1));
    const monthKey = `${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, "0")}`;
    const label = new Intl.DateTimeFormat("da-DK", { month: "short", timeZone: "UTC" }).format(m);
    bars.push({ label, value: meetings.filter((mt) => mt.dayKey.startsWith(monthKey)).length });
  }
  return bars;
}

export type SellerMeetingStats = {
  userId: string;
  name: string;
  thisWeek: number;
  thisMonth: number;
  hoursThisWeek: number;
  hoursThisMonth: number;
};

/** Standard full-time work week - the reference "timer på arbejde" is measured against. */
const STANDARD_WORK_HOURS_PER_WEEK = 37;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Meeting counts/hours for the current real week/month (independent of
 * which week the calendar grid above is currently showing). Both the weekly
 * and the monthly figures are read from the same merged CRM+Google,
 * Out-of-Office/internal-filtered calendar the grid renders - fetched
 * separately for the week and for the month (a month can't just reuse the
 * week's data, since it covers more than the week), so "denne uge" can never
 * come out larger than "denne måned" the way it did when the monthly number
 * was CRM-only and the weekly one already included Google Calendar meetings.
 */
export async function getMeetingStats(currentWeek?: CalendarWeek): Promise<{
  thisWeekTotal: number;
  thisMonthTotal: number;
  hoursThisWeek: number;
  hoursThisMonth: number;
  workHoursThisWeek: number;
  bySeller: SellerMeetingStats[];
}> {
  const now = new Date();
  const weekStart = utcWeekStart(now);
  const weekEnd = addUtcDays(weekStart, 7);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const [thisWeek, monthMeetings, users] = await Promise.all([
    currentWeek ?? getCalendarWeek(0),
    fetchMergedMeetings(monthStart, monthEnd),
    prisma.user.findMany({ select: { id: true, name: true, lastName: true }, orderBy: { name: "asc" } }),
  ]);

  const externalWeekMeetings = thisWeek.meetings.filter((m) => !m.isInternal);
  const externalMonthMeetings = monthMeetings.filter((m) => !m.isInternal);
  const timedWeekMeetings = externalWeekMeetings.filter((m) => m.hour !== -1);
  const timedMonthMeetings = externalMonthMeetings.filter((m) => m.hour !== -1);

  const thisWeekTotal = externalWeekMeetings.length;
  const thisMonthTotal = externalMonthMeetings.length;
  const hoursThisWeek = round1(timedWeekMeetings.reduce((sum, m) => sum + m.durationMinutes, 0) / 60);
  const hoursThisMonth = round1(timedMonthMeetings.reduce((sum, m) => sum + m.durationMinutes, 0) / 60);
  const workHoursThisWeek = users.length * STANDARD_WORK_HOURS_PER_WEEK;

  const bySeller = users
    .map((u) => {
      const weekMeetings = externalWeekMeetings.filter((m) => m.ownerUserId === u.id);
      const weekTimedMeetings = weekMeetings.filter((m) => m.hour !== -1);
      const monthTimedMeetings = timedMonthMeetings.filter((m) => m.ownerUserId === u.id);
      return {
        userId: u.id,
        name: [u.name, u.lastName].filter(Boolean).join(" "),
        thisWeek: weekMeetings.length,
        thisMonth: externalMonthMeetings.filter((m) => m.ownerUserId === u.id).length,
        hoursThisWeek: round1(weekTimedMeetings.reduce((sum, m) => sum + m.durationMinutes, 0) / 60),
        hoursThisMonth: round1(monthTimedMeetings.reduce((sum, m) => sum + m.durationMinutes, 0) / 60),
      };
    })
    .filter((s) => s.thisMonth > 0 || s.thisWeek > 0)
    .sort((a, b) => b.thisMonth - a.thisMonth);

  return { thisWeekTotal, thisMonthTotal, hoursThisWeek, hoursThisMonth, workHoursThisWeek, bySeller };
}
