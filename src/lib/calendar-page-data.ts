import { prisma } from "@/lib/db";
import { listCalendarEvents } from "@/lib/google-calendar";
import { dealName } from "@/lib/labels";

const CPH_TZ = "Europe/Copenhagen";

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
  source: "crm" | "google";
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
      googleCalendarEventId: true,
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
    source: "crm",
  }));

  const knownGoogleEventIds = new Set(deals.map((d) => d.googleCalendarEventId).filter((id): id is string => Boolean(id)));

  const accounts = await prisma.emailAccount.findMany({
    where: { provider: "GOOGLE" },
    include: { user: { select: { name: true, lastName: true } } },
  });

  // Padded by a day on each side so no real event can be clipped by a DST
  // offset near the week boundary - events outside the 7 real days are
  // filtered back out below via dayKeys.
  const timeMinIso = addUtcDays(weekStart, -1).toISOString();
  const timeMaxIso = addUtcDays(weekEnd, 1).toISOString();
  const dayKeys = new Set(days.map((d) => d.dayKey));

  const googleMeetings: CalendarMeeting[] = [];
  for (const account of accounts) {
    try {
      const events = await listCalendarEvents(account, { timeMinIso, timeMaxIso });
      const ownerName = [account.user.name, account.user.lastName].filter(Boolean).join(" ");

      for (const event of events) {
        if (knownGoogleEventIds.has(event.id)) continue;
        const start = new Date(event.startIso);
        if (Number.isNaN(start.getTime())) continue;

        if (event.isAllDay) {
          // All-day events come back as a bare "YYYY-MM-DD" (no timezone to convert).
          const dKey = event.startIso.slice(0, 10);
          if (!dayKeys.has(dKey)) continue;
          googleMeetings.push({
            id: `google-${account.userId}-${event.id}`,
            dayKey: dKey,
            hour: -1,
            minute: 0,
            label: event.summary,
            href: null,
            ownerName,
            source: "google",
          });
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

        googleMeetings.push({
          id: `google-${account.userId}-${event.id}`,
          dayKey: dKey,
          hour: Number(get("hour")),
          minute: Number(get("minute")),
          label: event.summary,
          href: null,
          ownerName,
          source: "google",
        });
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

export type SellerMeetingStats = { userId: string; name: string; thisWeek: number; thisMonth: number };

/** Meeting counts for the current real week/month (independent of which
 * week the calendar grid above is currently showing). */
export async function getMeetingStats(): Promise<{
  thisWeekTotal: number;
  thisMonthTotal: number;
  bySeller: SellerMeetingStats[];
}> {
  const now = new Date();
  const weekStart = utcWeekStart(now);
  const weekEnd = addUtcDays(weekStart, 7);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const rangeStart = new Date(Math.min(weekStart.getTime(), monthStart.getTime()));
  const rangeEnd = new Date(Math.max(weekEnd.getTime(), monthEnd.getTime()));

  const [deals, users] = await Promise.all([
    prisma.deal.findMany({
      where: { meetingDate: { gte: rangeStart, lt: rangeEnd } },
      select: { ownerId: true, meetingDate: true },
    }),
    prisma.user.findMany({ select: { id: true, name: true, lastName: true }, orderBy: { name: "asc" } }),
  ]);

  const inRange = (d: Date, start: Date, end: Date) => d >= start && d < end;

  const thisWeekTotal = deals.filter((d) => inRange(d.meetingDate!, weekStart, weekEnd)).length;
  const thisMonthTotal = deals.filter((d) => inRange(d.meetingDate!, monthStart, monthEnd)).length;

  const bySeller = users
    .map((u) => ({
      userId: u.id,
      name: [u.name, u.lastName].filter(Boolean).join(" "),
      thisWeek: deals.filter((d) => d.ownerId === u.id && inRange(d.meetingDate!, weekStart, weekEnd)).length,
      thisMonth: deals.filter((d) => d.ownerId === u.id && inRange(d.meetingDate!, monthStart, monthEnd)).length,
    }))
    .filter((s) => s.thisMonth > 0 || s.thisWeek > 0)
    .sort((a, b) => b.thisMonth - a.thisMonth);

  return { thisWeekTotal, thisMonthTotal, bySeller };
}
